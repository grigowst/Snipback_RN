/**
 * @format
 */

// Must be first: gives crypto.getRandomValues to the RSA padding (src/utils/rsa.ts).
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
