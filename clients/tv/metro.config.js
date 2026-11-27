// T-Max TV comparte con la app del celular la capa de datos, el reproductor y la tipografía
// (clients/ios/src), sin copiarlos. Todo módulo se resuelve SOLO desde clients/tv/node_modules
// para que haya una sola copia de React Native (la versión para TV).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../ios/src');
const coreRoot = path.resolve(projectRoot, '../../packages/core');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot, coreRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
// Nunca tomar paquetes de clients/ios/node_modules (ahí está el React Native del celular).
const iosModules = path.resolve(projectRoot, '../ios/node_modules').replace(/[\\/]/g, '[\\\\/]');
config.resolver.blockList = [].concat(config.resolver.blockList || [], [new RegExp(`^${iosModules}[\\\\/].*`)]);
config.resolver.unstable_enableSymlinks = true;
// "@shared/…" = clients/ios/src/…
const baseResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@shared/')) {
    return context.resolveRequest(context, path.join(sharedRoot, moduleName.slice('@shared/'.length)), platform);
  }
  return (baseResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
