import path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import CleanTerminalWebpackPlugin from 'clean-terminal-webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import * as url from 'url';
import glob from 'glob';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV == 'production';
const isDevelopment = !isProduction;


// Set up the config common to both the extension and the extension's tests
// (basically everything except the entry point and output location)

let baseConfig = {
  target: 'node',
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
   resolve: {
    extensions: [ '.ts', '.js' ]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [{ loader: 'ts-loader', options: {onlyCompileBundledFiles: true} }]
      }
    ],
    noParse: path.resolve(__dirname,'./node_modules/typescript/lib/typescript.js')
  },
  plugins: [
    new CleanTerminalWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns:[
        {
          context: './src/',
          from: "./images/**/!(raw)/*",
          to: ""
        },
        {
          from: "./node_modules/vscode-codicons/dist/codicon.css",
          to: ""
        },
        {
          from: "./node_modules/vscode-codicons/dist/codicon.ttf",
          to: ""
        }
      ]
    })
  ]
};

if (isDevelopment) {
  baseConfig['mode'] = 'development';
} else {
  baseConfig['mode'] = 'production';
  baseConfig.plugins.splice(0,0,new CleanWebpackPlugin()); // <-- clean has to be the first plugin
}


// setup the extension's config
let mainConfig = {
  ...baseConfig,
  ...{
    entry: './src/extensionEntryPoint.ts',
    output: {
      path: path.resolve(__dirname,'./out-bundle/'),
      filename: 'extensionEntryPoint.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]'
    }
  }
};

// config for the  and the extension's tests
function getTests() {
  let files = glob.sync('./src/**/*.test.ts');
  console.log('found these tests:');
  console.dir(files);
  return files;
}

let testConfig = {
  ...baseConfig,
  ...{
    entry: [
      //...getTests(),            <-- nevermind, must add tests in EntryPoint.ts because of all of the circular references.
      './src/testsEntryPoint.ts',
    ],
    output: {
      path: path.resolve(__dirname,'./out-tests-bundle/'),
      filename: 'testsEntryPoint.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]'
    }
  }
}

console.log('mode: '+baseConfig['mode']);

export default [
  mainConfig,
  testConfig
];