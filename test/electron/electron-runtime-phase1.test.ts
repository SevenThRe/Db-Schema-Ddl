import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDesktopCheckpoint,
  normalizeElectronBoundaryErrorMessage,
  shouldPresentFatalDialog,
} from "../../shared/desktop-runtime";

test("shutdown paths suppress duplicate fatal dialogs", () => {
  assert.equal(
    shouldPresentFatalDialog({ requested: true, shuttingDown: true, hasShownDialog: false }),
    false,
  );
  assert.equal(
    shouldPresentFatalDialog({ requested: true, shuttingDown: false, hasShownDialog: true }),
    false,
  );
  assert.equal(
    shouldPresentFatalDialog({ requested: true, shuttingDown: false, hasShownDialog: false }),
    true,
  );
});

test("checkpoint formatting stays deterministic for runtime logs", () => {
  const line = formatDesktopCheckpoint("shutdown_requested", { activeSocketCount: 3 });
  assert.equal(line, '[checkpoint:shutdown_requested] {"activeSocketCount":3}');
});

test("remote electron boundary errors are normalized into user-facing messages", () => {
  const message = normalizeElectronBoundaryErrorMessage(
    new Error(
      "Error invoking remote method 'extensions:get-catalog': Error: Official extension manifest asset was not found on GitHub releases.",
    ),
    "当前环境暂不支持检查扩展更新。",
  );

  assert.equal(message, "官方扩展暂未发布，当前还没有可下载的安装包。");
});
