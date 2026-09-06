#pragma once

#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace TomCatWeb {

struct Feature {
    std::string id;
    uint32_t version = 1;
    std::vector<std::string> capabilities;
};

using CommandHandler = std::function<std::string(const std::string& payload)>;
using EventHandler = std::function<void(const std::string& json)>;

/** Runtime extension registry. Adapters are intentionally independent of TomCat core. */
class Registry final {
public:
    static Registry& instance();
    bool registerFeature(Feature feature, CommandHandler handler = {});
    bool unregisterFeature(const std::string& id);
    std::vector<Feature> features() const;
    std::string dispatch(const std::string& feature, const std::string& payload) const;
    void setEventHandler(EventHandler handler);
    void emit(std::string json) const;
private:
    mutable std::mutex mutex_;
    std::unordered_map<std::string, Feature> features_;
    std::unordered_map<std::string, CommandHandler> handlers_;
    EventHandler eventHandler_;
};

/** Host-neutral event bridge used by both the WebGL and GLFW adapters. */
class Bridge final {
public:
    static Bridge& instance();
    void boot();
    void shutdown();
    void frame(double deltaSeconds);
    void push(std::string json);
    void emit(std::string json);
    std::string poll();
    void dispatch(const std::string& feature, const std::string& payload);
    bool running() const;
private:
    mutable std::mutex mutex_;
    std::vector<std::string> incoming_;
    std::vector<std::string> outgoing_;
    bool running_ = false;
    double elapsed_ = 0.0;
};

} // namespace TomCatWeb

extern "C" {
using tc_web_event_callback = void(*)(const char* json);
void tc_web_set_event_callback(tc_web_event_callback callback);
void tc_web_boot();
void tc_web_shutdown();
void tc_web_frame(double delta_seconds);
void tc_web_push_event(const char* json);
const char* tc_web_poll_event();
void tc_web_dispatch(const char* feature, const char* payload);
}





