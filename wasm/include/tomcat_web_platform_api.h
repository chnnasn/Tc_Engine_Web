#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Browser Player contract. The host copies a validated TCPAK into WASM memory;
// the callee must finish reading it before boot returns.
int tc_web_player_boot(int width, int height, const uint8_t* package_bytes,
                       size_t package_size);
void tc_web_player_frame(double delta_seconds);
void tc_web_player_resize(int width, int height);
void tc_web_player_shutdown(void);

// Versioned Editor RPC contract. The returned UTF-8 JSON remains valid until
// the next RPC call on the same worker. Request and reply use tomcat.web.v1.
const char* tc_web_editor_rpc(const char* request_json);

#ifdef __cplusplus
}
#endif
