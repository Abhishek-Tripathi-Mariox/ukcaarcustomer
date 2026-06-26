const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);

const originalResolveRequest = defaultConfig.resolver.resolveRequest;

const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      // Force Metro to use the browser/RN build of axios instead of the Node build.
      // axios v1.6+ Node build imports 'crypto', 'http', etc. which don't exist in RN.
      if (moduleName === 'axios') {
        return {
          filePath: path.resolve(
            __dirname,
            'node_modules/axios/dist/browser/axios.cjs'
          ),
          type: 'sourceFile',
        };
      }
      if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
