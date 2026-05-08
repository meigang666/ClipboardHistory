// Skip winCodeSign to avoid symbolic link errors on Windows
exports.default = async function afterPack(context) {
  // Do nothing - skip code signing
  return Promise.resolve();
};