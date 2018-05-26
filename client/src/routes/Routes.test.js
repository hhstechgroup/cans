import React from 'react';
import { executeTest } from './Routes.test.util';
import { Assessment } from '../components/Assessment';

/**
 * To test that a configured route is working, create a new
 * it block below and pass executeTest() the component, the url and some html
 * that will be rendered from the component.
 *
 * example: the following route is defined in Routes.js:
 *   <Route path="/home" component={Home} />
 *
 * so you will pass the following:
 *   executeTest(Home, /home', 'Welcome!')
 */

it('navigates to assessment', () => {
  executeTest(Assessment, '/assessment', 'COMMUNIMETRIC');
});