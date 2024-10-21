// webpack.config.js

const path = require('path');

module.exports = {
  entry: './src/index.js', // Ensure this points to your React entry file
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/', // Necessary for React Router or dynamic imports
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/, // Handle JS and JSX files
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // Transpile with Babel
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/, // Handle CSS files
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/i, // Handle image files
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'], // Resolve these extensions
  },
  devServer: {
    static: path.join(__dirname, 'public'),
    compress: true,
    port: 8080, // Ensure it's set to 8080
    historyApiFallback: true, // For React Router
    proxy: [
      {
        context: ['/socket.io'], // Paths to proxy
        target: 'http://localhost:3000', // Backend server
        ws: true, // Enable WebSocket proxying
      },
    ],
  },
  mode: 'development', // Set mode to development
};
