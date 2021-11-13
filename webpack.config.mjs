import path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import CleanTerminalWebpackPlugin from 'clean-terminal-webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import * as url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV == 'production';
const isDevelopment = !isProduction;

let baseConfig = {
  entry: './src/extensionEntryPoint.ts',
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
  output: {
    path: path.resolve(__dirname,'./out-bundle/'),
    filename: 'extensionEntryPoint.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
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
      ]
    })
  ]
};

let devConfig = {
  mode: 'development',
};

let prodConfig = {
  mode: 'production',
}


let config;
if (isDevelopment)
  config = [{...baseConfig,...devConfig}];
else
  config = [{...baseConfig,...prodConfig}];


if (isProduction)
  config[0].plugins.splice(0,0,new CleanWebpackPlugin()); // <-- clean has to be the first plugin


console.log('mode: '+config[0].mode);

export default config;