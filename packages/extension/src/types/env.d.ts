export {};

declare global {
  const process: { env: { EXTENSION_VERSION?: string; DEBUG?: string } };
}
