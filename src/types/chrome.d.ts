declare namespace chrome {
  namespace runtime {
    function sendMessage(message: any): Promise<any>;
    function sendMessage(extensionId: string, message: any): Promise<any>;
    function sendMessage(message: any, responseCallback?: (response: any) => void): void;
    function sendMessage(extensionId: string, message: any, responseCallback?: (response: any) => void): void;
  }
}

declare global {
  interface Window {
    chrome?: typeof chrome;
  }
}
