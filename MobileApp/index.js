/**
 * @format
 */
import 'react-native-gesture-handler'; // precisa ser o primeiríssimo import (exigência do react-navigation)

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
