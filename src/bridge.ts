declare global {
  interface Window {
    chrome?: { webview?: { postMessage(message: unknown): void; addEventListener(type: 'message', listener: (event: MessageEvent) => void): void } };
  }
}
export const nativeBridge = window.chrome?.webview;
export const sendNative = (message: unknown): void => nativeBridge?.postMessage(message);
