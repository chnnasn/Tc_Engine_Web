#include "tomcat_web.hpp"

#include <algorithm>
#include <utility>

namespace {
tc_web_event_callback g_callback = nullptr;
thread_local std::string g_poll_buffer;
}

namespace TomCatWeb {

Registry& Registry::instance() { static Registry value; return value; }

bool Registry::registerFeature(Feature feature, CommandHandler handler) {
    if (feature.id.empty()) return false;
    std::scoped_lock lock(mutex_);
    if (features_.contains(feature.id)) return false;
    handlers_[feature.id] = std::move(handler);
    features_.emplace(feature.id, std::move(feature));
    return true;
}

bool Registry::unregisterFeature(const std::string& id) {
    std::scoped_lock lock(mutex_);
    handlers_.erase(id);
    return features_.erase(id) != 0;
}

std::vector<Feature> Registry::features() const {
    std::scoped_lock lock(mutex_);
    std::vector<Feature> result;
    result.reserve(features_.size());
    for (const auto& [_, feature] : features_) result.push_back(feature);
    std::sort(result.begin(), result.end(), [](const Feature& a, const Feature& b) { return a.id < b.id; });
    return result;
}

std::string Registry::dispatch(const std::string& feature, const std::string& payload) const {
    CommandHandler handler;
    {
        std::scoped_lock lock(mutex_);
        const auto it = handlers_.find(feature);
        if (it == handlers_.end()) return {};
        handler = it->second;
    }
    return handler ? handler(payload) : std::string{};
}

void Registry::setEventHandler(EventHandler handler) {
    std::scoped_lock lock(mutex_);
    eventHandler_ = std::move(handler);
}

void Registry::emit(std::string json) const {
    EventHandler handler;
    { std::scoped_lock lock(mutex_); handler = eventHandler_; }
    if (handler) handler(json);
    Bridge::instance().emit(std::move(json));
}

Bridge& Bridge::instance() { static Bridge value; return value; }
void Bridge::boot() { std::scoped_lock lock(mutex_); running_ = true; elapsed_ = 0.0; }
void Bridge::shutdown() { std::scoped_lock lock(mutex_); running_ = false; incoming_.clear(); outgoing_.clear(); }
void Bridge::frame(double deltaSeconds) {
    std::scoped_lock lock(mutex_);
    if (running_) elapsed_ += std::max(0.0, deltaSeconds);
}
void Bridge::push(std::string json) { if (json.empty()) return; std::scoped_lock lock(mutex_); incoming_.push_back(std::move(json)); }
void Bridge::emit(std::string json) {
    if (json.empty()) return;
    // Keep polling available for workers while also supporting the low-latency
    // callback path used by Emscripten's JS bridge.
    tc_web_event_callback callback = g_callback;
    {
        std::scoped_lock lock(mutex_);
        outgoing_.push_back(json);
    }
    if (callback) callback(json.c_str());
}
std::string Bridge::poll() {
    std::scoped_lock lock(mutex_);
    if (outgoing_.empty()) return {};
    auto value = std::move(outgoing_.front()); outgoing_.erase(outgoing_.begin()); return value;
}
void Bridge::dispatch(const std::string& feature, const std::string& payload) {
    auto result = Registry::instance().dispatch(feature, payload);
    if (!result.empty()) emit(std::move(result));
}
bool Bridge::running() const { std::scoped_lock lock(mutex_); return running_; }

} // namespace TomCatWeb

extern "C" {
void tc_web_set_event_callback(tc_web_event_callback callback) { g_callback = callback; }
void tc_web_boot() { TomCatWeb::Bridge::instance().boot(); }
void tc_web_shutdown() { TomCatWeb::Bridge::instance().shutdown(); }
void tc_web_frame(double delta_seconds) { TomCatWeb::Bridge::instance().frame(delta_seconds); }
void tc_web_push_event(const char* json) { if (json) TomCatWeb::Bridge::instance().push(json); }
const char* tc_web_poll_event() {
    g_poll_buffer = TomCatWeb::Bridge::instance().poll();
    return g_poll_buffer.empty() ? nullptr : g_poll_buffer.c_str();
}
void tc_web_dispatch(const char* feature, const char* payload) {
    if (feature) TomCatWeb::Bridge::instance().dispatch(feature, payload ? payload : "{}");
}
}




