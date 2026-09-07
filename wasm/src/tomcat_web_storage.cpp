#include "tomcat_web_storage.hpp"

#include "tomcat_web.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <limits>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <system_error>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

// Keep the browser-specific filesystem calls in this translation unit.  The
// rest of the engine only sees ordinary std::filesystem paths and therefore
// remains usable by native tools and tests.
EM_JS(int, tc_web_storage_mount_js, (const char* mount_path), {
  try {
    const path = UTF8ToString(mount_path);
    if (!path || path[0] !== '/') return -2;
    FS.mkdirTree(path);
    // A fresh module has no IDBFS mount at this path.  The C++ side guards
    // repeated calls, so mounting once is enough and avoids EEXIST errors.
    FS.mount(IDBFS, {}, path);
    return 0;
  } catch (error) {
    return -1;
  }
});

EM_JS(void, tc_web_storage_sync_js, (int populate), {
  try {
    FS.syncfs(!!populate, function(error) {
      const ok = error ? 0 : 1;
      if (typeof Module !== 'undefined' &&
          typeof Module._tc_web_storage_sync_complete === 'function') {
        Module._tc_web_storage_sync_complete(populate, ok);
      }
    });
  } catch (error) {
    if (typeof Module !== 'undefined' &&
        typeof Module._tc_web_storage_sync_complete === 'function') {
      Module._tc_web_storage_sync_complete(populate, 0);
    }
  }
});
#endif

namespace {

std::mutex g_storageMutex;
std::filesystem::path g_mountPath = "/tomcat";
bool g_mounted = false;
bool g_syncPending = false;
bool g_syncLastOk = true;

thread_local std::string g_lastError;
thread_local std::string g_textBuffer;
thread_local std::string g_listBuffer;

void ClearError() { g_lastError.clear(); }

int Fail(std::string message, int code = -1)
{
  g_lastError = std::move(message);
  return code;
}

std::string JsonEscape(std::string_view value)
{
  std::string escaped;
  escaped.reserve(value.size() + 8);
  for (unsigned char ch : value)
  {
    switch (ch)
    {
      case '"': escaped += "\\\""; break;
      case '\\': escaped += "\\\\"; break;
      case '\b': escaped += "\\b"; break;
      case '\f': escaped += "\\f"; break;
      case '\n': escaped += "\\n"; break;
      case '\r': escaped += "\\r"; break;
      case '\t': escaped += "\\t"; break;
      default:
        if (ch < 0x20)
        {
          static constexpr char hex[] = "0123456789abcdef";
          escaped += "\\u00";
          escaped += hex[(ch >> 4) & 0xf];
          escaped += hex[ch & 0xf];
        }
        else
          escaped.push_back(static_cast<char>(ch));
        break;
    }
  }
  return escaped;
}

void Emit(std::string type, std::string payload = "{}")
{
  TomCatWeb::Bridge::instance().emit(
    "{\"type\":\"" + JsonEscape(type) + "\",\"payload\":" + payload + "}");
}

bool IsSafeSegment(std::string_view value)
{
  if (value.empty() || value == "." || value == "..") return false;
  for (unsigned char ch : value)
  {
    if (!(std::isalnum(ch) || ch == '_' || ch == '-' || ch == '.')) return false;
  }
  return true;
}

bool IsSafeFileSegment(std::string_view value)
{
  if (value.empty() || value == "." || value == "..") return false;
  for (unsigned char ch : value)
  {
    // Scene names are user-facing and may contain spaces/UTF-8.  They still
    // must remain one virtual filesystem component and cannot contain control
    // bytes that make the C ABI or JSON event stream ambiguous.
    if (ch < 0x20 || ch == '/' || ch == '\\') return false;
  }
  return true;
}

std::filesystem::path NormalizeMount(const char* raw)
{
  if (!raw || !*raw) return {};
  std::filesystem::path path(raw);
  if (!path.is_absolute()) return {};
  // Check the original components before lexical normalization.  Checking
  // only the normalized path would silently turn `/tomcat/../outside` into
  // `/outside` and accept a mount string that violates the ABI contract.
  for (const auto& part : path)
    if (part == "..") return {};
  path = path.lexically_normal();
  return path;
}

bool IsWithinMount(const std::filesystem::path& path)
{
  const auto root = g_mountPath.lexically_normal();
  const auto candidate = path.lexically_normal();
  auto rootIt = root.begin();
  auto candidateIt = candidate.begin();
  for (; rootIt != root.end(); ++rootIt, ++candidateIt)
  {
    if (candidateIt == candidate.end() || *rootIt != *candidateIt) return false;
  }
  return true;
}

std::filesystem::path ResolvePath(const char* raw, bool allowMountRoot = false)
{
  if (!raw || !*raw) return {};
  std::filesystem::path path(raw);
  if (!path.is_absolute()) path = g_mountPath / path;
  path = path.lexically_normal();
  if (!IsWithinMount(path)) return {};
  if (!allowMountRoot && path == g_mountPath) return {};
  return path;
}

bool EnsureMounted()
{
  std::scoped_lock lock(g_storageMutex);
  if (!g_mounted)
  {
    g_lastError = "storage is not mounted; call tc_web_storage_mount first";
    return false;
  }
  return true;
}

int EnsureParent(const std::filesystem::path& path)
{
  std::error_code ec;
  const auto parent = path.parent_path();
  if (!parent.empty()) std::filesystem::create_directories(parent, ec);
  if (ec) return Fail("cannot create parent directory: " + ec.message());
  return 0;
}

int WriteBytes(const std::filesystem::path& path, const void* data, uint32_t size)
{
  if (EnsureParent(path) != 0) return -1;
  if (size != 0 && data == nullptr) return Fail("data pointer is null");

  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output) return Fail("cannot open file for writing: " + path.string());
  if (size != 0) output.write(static_cast<const char*>(data), static_cast<std::streamsize>(size));
  if (!output.good()) return Fail("cannot write file: " + path.string());
  ClearError();
  return 0;
}

int32_t FileSize(const std::filesystem::path& path)
{
  std::error_code ec;
  const auto size = std::filesystem::file_size(path, ec);
  if (ec) return Fail("cannot stat file: " + path.string() + ": " + ec.message());
  if (size > static_cast<uintmax_t>(std::numeric_limits<int32_t>::max()))
    return Fail("file is too large for the Web ABI", -1);
  ClearError();
  return static_cast<int32_t>(size);
}

std::string QuoteYaml(std::string_view value)
{
  std::string result = "\"";
  for (const char ch : value)
  {
    if (ch == '\\' || ch == '"') result.push_back('\\');
    result.push_back(ch);
  }
  result.push_back('"');
  return result;
}

std::filesystem::path ProjectDirectory(std::string_view id)
{
  return g_mountPath / "projects" / std::string(id);
}

std::filesystem::path ProjectFile(std::string_view id)
{
  return ProjectDirectory(id) / "Project.tcproj";
}

std::string NormalizeSceneId(std::string_view id)
{
  std::string scene(id);
  constexpr std::string_view suffix = ".tomcat";
  if (scene.size() > suffix.size() && scene.ends_with(suffix))
    scene.resize(scene.size() - suffix.size());
  return scene;
}

std::filesystem::path SceneFile(std::string_view projectId, std::string_view sceneId)
{
  return ProjectDirectory(projectId) / "Assets" / (NormalizeSceneId(sceneId) + ".tomcat");
}

bool ValidProjectAndSceneId(const char* projectId, const char* sceneId = nullptr)
{
  if (!projectId || !IsSafeSegment(projectId)) return false;
  if (sceneId)
  {
    const std::string normalized = NormalizeSceneId(sceneId);
    if (!IsSafeFileSegment(normalized)) return false;
  }
  return true;
}

} // namespace

extern "C" {

int tc_web_storage_mount(const char* mount_path)
{
  const auto path = NormalizeMount(mount_path);
  if (path.empty()) return Fail("mount path must be an absolute path without '..'");

  {
    std::scoped_lock lock(g_storageMutex);
    if (g_mounted && path == g_mountPath)
    {
      ClearError();
      return 0;
    }
    if (g_mounted) return Fail("a different storage mount is already active");
  }

#ifdef __EMSCRIPTEN__
  const std::string pathString = path.string();
  const int result = tc_web_storage_mount_js(pathString.c_str());
  if (result != 0) return Fail("IDBFS mount failed", result);
#else
  std::error_code ec;
  std::filesystem::create_directories(path, ec);
  if (ec) return Fail("cannot create storage mount: " + ec.message());
#endif

  {
    std::scoped_lock lock(g_storageMutex);
    g_mountPath = path;
    g_mounted = true;
    g_syncPending = false;
    g_syncLastOk = true;
  }
  ClearError();
  Emit("storage.mounted", "{\"path\":\"" + JsonEscape(path.string()) + "\"}");
  return 0;
}

int tc_web_storage_sync(int populate)
{
  if (!EnsureMounted()) return -3;
  {
    std::scoped_lock lock(g_storageMutex);
    if (g_syncPending) return Fail("a storage sync is already pending", -4);
    g_syncPending = true;
    g_syncLastOk = false;
  }

#ifdef __EMSCRIPTEN__
  tc_web_storage_sync_js(populate ? 1 : 0);
#else
  // Native builds do not have an IndexedDB backend.  Treat the operation as
  // an immediate successful flush so bridge and serializer tests are useful
  // on every host.
  tc_web_storage_sync_complete(populate ? 1 : 0, 1);
#endif
  ClearError();
  return 0;
}

int tc_web_storage_sync_pending()
{
  std::scoped_lock lock(g_storageMutex);
  return g_syncPending ? 1 : 0;
}

int tc_web_storage_sync_last_ok()
{
  std::scoped_lock lock(g_storageMutex);
  return g_syncLastOk ? 1 : 0;
}

const char* tc_web_storage_last_error()
{
  return g_lastError.c_str();
}

int tc_web_storage_exists(const char* rawPath)
{
  if (!EnsureMounted()) return 0;
  const auto path = ResolvePath(rawPath, true);
  if (path.empty()) { Fail("path escapes the storage mount"); return 0; }
  std::error_code ec;
  const bool result = std::filesystem::exists(path, ec);
  if (ec) { Fail("cannot inspect path: " + ec.message()); return 0; }
  ClearError();
  return result ? 1 : 0;
}

int tc_web_storage_mkdir(const char* rawPath)
{
  if (!EnsureMounted()) return -3;
  const auto path = ResolvePath(rawPath, false);
  if (path.empty()) return Fail("path escapes the storage mount");
  std::error_code ec;
  std::filesystem::create_directories(path, ec);
  if (ec) return Fail("cannot create directory: " + ec.message());
  ClearError();
  return 0;
}

int tc_web_storage_remove(const char* rawPath)
{
  if (!EnsureMounted()) return -3;
  const auto path = ResolvePath(rawPath, false);
  if (path.empty()) return Fail("path escapes the storage mount");
  std::error_code ec;
  const auto removed = std::filesystem::remove_all(path, ec);
  if (ec) return Fail("cannot remove path: " + ec.message());
  ClearError();
  if (removed > static_cast<uintmax_t>(std::numeric_limits<int>::max()))
    return std::numeric_limits<int>::max();
  return static_cast<int>(removed);
}

int32_t tc_web_storage_size(const char* rawPath)
{
  if (!EnsureMounted()) return -3;
  const auto path = ResolvePath(rawPath);
  if (path.empty()) return Fail("path escapes the storage mount");
  return FileSize(path);
}

int32_t tc_web_storage_read(const char* rawPath, void* destination, uint32_t capacity)
{
  if (!EnsureMounted()) return -3;
  const auto path = ResolvePath(rawPath);
  if (path.empty()) return Fail("path escapes the storage mount");

  const int32_t size = FileSize(path);
  if (size < 0) return size;
  if (static_cast<uint64_t>(size) > capacity) return Fail("destination buffer is too small", -2);
  if (size != 0 && destination == nullptr) return Fail("destination pointer is null");

  std::ifstream input(path, std::ios::binary);
  if (!input) return Fail("cannot open file for reading: " + path.string());
  if (size != 0) input.read(static_cast<char*>(destination), size);
  if (!input.good() && !input.eof()) return Fail("cannot read file: " + path.string());
  ClearError();
  return size;
}

int tc_web_storage_write(const char* rawPath, const void* data, uint32_t size)
{
  if (!EnsureMounted()) return -3;
  const auto path = ResolvePath(rawPath);
  if (path.empty()) return Fail("path escapes the storage mount");
  return WriteBytes(path, data, size);
}

const char* tc_web_storage_read_text(const char* rawPath)
{
  g_textBuffer.clear();
  if (!EnsureMounted()) return nullptr;
  const auto path = ResolvePath(rawPath);
  if (path.empty()) { Fail("path escapes the storage mount"); return nullptr; }
  std::ifstream input(path, std::ios::binary);
  if (!input) { Fail("cannot open file for reading: " + path.string()); return nullptr; }
  std::ostringstream stream;
  stream << input.rdbuf();
  if (!input.good() && !input.eof()) { Fail("cannot read file: " + path.string()); return nullptr; }
  g_textBuffer = stream.str();
  ClearError();
  return g_textBuffer.c_str();
}

int tc_web_storage_write_text(const char* rawPath, const char* text)
{
  if (!text) return Fail("text pointer is null");
  return tc_web_storage_write(rawPath, text, static_cast<uint32_t>(std::char_traits<char>::length(text)));
}

const char* tc_web_storage_list(const char* rawDirectory)
{
  g_listBuffer.clear();
  if (!EnsureMounted()) return nullptr;
  const auto directory = ResolvePath(rawDirectory, true);
  if (directory.empty()) { Fail("path escapes the storage mount"); return nullptr; }

  std::error_code ec;
  if (!std::filesystem::is_directory(directory, ec))
  {
    if (ec) Fail("cannot inspect directory: " + ec.message());
    else Fail("path is not a directory: " + directory.string());
    return nullptr;
  }

  g_listBuffer = "[";
  bool first = true;
  for (std::filesystem::directory_iterator it(directory, ec), end; it != end && !ec; it.increment(ec))
  {
    const auto& entry = *it;
    const std::string name = entry.path().filename().string();
    // Asset names are user-facing and may contain spaces or UTF-8.  The
    // resolved directory is already constrained to the storage mount, so
    // only skip the two synthetic traversal names instead of applying the
    // stricter project/scene ID alphabet here.
    if (name.empty() || name == "." || name == "..") continue;
    const bool isDirectory = entry.is_directory(ec);
    if (ec) break;
    if (!first) g_listBuffer += ",";
    first = false;
    g_listBuffer += "{\"name\":\"" + JsonEscape(name) + "\",\"directory\":" +
      std::string(isDirectory ? "true" : "false");
    if (!isDirectory)
    {
      const auto size = entry.is_regular_file(ec) ? entry.file_size(ec) : 0;
      if (ec) break;
      g_listBuffer += ",\"size\":" + std::to_string(size);
    }
    g_listBuffer += "}";
  }
  if (ec) { g_listBuffer.clear(); Fail("cannot enumerate directory: " + ec.message()); return nullptr; }
  g_listBuffer += "]";
  ClearError();
  return g_listBuffer.c_str();
}

int tc_web_project_create(const char* project_id, const char* name, const char* template_name)
{
  if (!EnsureMounted()) return -3;
  if (!ValidProjectAndSceneId(project_id)) return Fail("invalid project id");
  const std::string projectName = (name && *name) ? name : project_id;
  const std::string projectTemplate = (template_name && *template_name) ? template_name : "2D";
  const auto file = ProjectFile(project_id);
  if (std::filesystem::exists(file)) return Fail("project already exists", -2);

  const std::string yaml =
    "Project:\n"
    "  Name: " + QuoteYaml(projectName) + "\n"
    "  Version: \"1.0.0\"\n"
    "  Description: \"\"\n"
    "  EditorVersion: \"web\"\n"
    "  Template: " + QuoteYaml(projectTemplate) + "\n"
    "  AssetDirectory: \"Assets\"\n"
    "  TwoColumnCurrentFolder: \"\"\n"
    "  ExpandedNodes: []\n"
    "  LastOperationTime: \"\"\n";
  if (WriteBytes(file, yaml.data(), static_cast<uint32_t>(yaml.size())) != 0) return -1;
  if (tc_web_storage_mkdir((ProjectDirectory(project_id) / "Assets").string().c_str()) != 0) return -1;
  Emit("project.created", "{\"id\":\"" + JsonEscape(project_id) + "\",\"name\":\"" + JsonEscape(projectName) + "\"}");
  return 0;
}

int tc_web_project_save(const char* project_id, const char* yaml)
{
  if (!EnsureMounted()) return -3;
  if (!ValidProjectAndSceneId(project_id)) return Fail("invalid project id");
  if (!yaml) return Fail("yaml pointer is null");
  const auto file = ProjectFile(project_id);
  const int result = WriteBytes(file, yaml, static_cast<uint32_t>(std::char_traits<char>::length(yaml)));
  if (result == 0)
    Emit("project.saved", "{\"id\":\"" + JsonEscape(project_id) + "\"}");
  return result;
}

const char* tc_web_project_load(const char* project_id)
{
  if (!ValidProjectAndSceneId(project_id)) { Fail("invalid project id"); return nullptr; }
  const char* value = tc_web_storage_read_text(ProjectFile(project_id).string().c_str());
  if (value)
    Emit("project.loaded", "{\"id\":\"" + JsonEscape(project_id) + "\"}");
  return value;
}

int tc_web_project_remove(const char* project_id)
{
  if (!EnsureMounted()) return -3;
  if (!ValidProjectAndSceneId(project_id)) return Fail("invalid project id");
  const int result = tc_web_storage_remove(ProjectDirectory(project_id).string().c_str());
  if (result >= 0)
    Emit("project.removed", "{\"id\":\"" + JsonEscape(project_id) + "\"}");
  return result;
}

int tc_web_scene_save(const char* project_id, const char* scene_id, const char* yaml)
{
  if (!EnsureMounted()) return -3;
  if (!ValidProjectAndSceneId(project_id, scene_id)) return Fail("invalid project or scene id");
  if (!yaml) return Fail("yaml pointer is null");
  const auto file = SceneFile(project_id, scene_id);
  const int result = WriteBytes(file, yaml, static_cast<uint32_t>(std::char_traits<char>::length(yaml)));
  if (result == 0)
    Emit("scene.saved", "{\"project\":\"" + JsonEscape(project_id) + "\",\"scene\":\"" + JsonEscape(NormalizeSceneId(scene_id)) + "\"}");
  return result;
}

const char* tc_web_scene_load(const char* project_id, const char* scene_id)
{
  if (!ValidProjectAndSceneId(project_id, scene_id)) { Fail("invalid project or scene id"); return nullptr; }
  const char* value = tc_web_storage_read_text(SceneFile(project_id, scene_id).string().c_str());
  if (value)
    Emit("scene.loaded", "{\"project\":\"" + JsonEscape(project_id) + "\",\"scene\":\"" + JsonEscape(NormalizeSceneId(scene_id)) + "\"}");
  return value;
}

int tc_web_scene_remove(const char* project_id, const char* scene_id)
{
  if (!EnsureMounted()) return -3;
  if (!ValidProjectAndSceneId(project_id, scene_id)) return Fail("invalid project or scene id");
  const int result = tc_web_storage_remove(SceneFile(project_id, scene_id).string().c_str());
  if (result >= 0)
    Emit("scene.removed", "{\"project\":\"" + JsonEscape(project_id) + "\",\"scene\":\"" + JsonEscape(NormalizeSceneId(scene_id)) + "\"}");
  return result;
}

void tc_web_storage_sync_complete(int populate, int ok)
{
  {
    std::scoped_lock lock(g_storageMutex);
    g_syncPending = false;
    g_syncLastOk = ok != 0;
  }
  if (ok)
    ClearError();
  else
    g_lastError = "IDBFS synchronization failed";
  Emit("storage.sync", "{\"populate\":" + std::string(populate ? "true" : "false") +
       ",\"ok\":" + std::string(ok ? "true" : "false") + "}");
}

} // extern "C"
