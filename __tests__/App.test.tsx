/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.useFakeTimers();

test('shows the splash, then the login screen when no session is saved', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const texts = () =>
    renderer.root.findAll(node => typeof node.props.children === 'string').map(n => n.props.children);

  expect(texts()).not.toContain('SIGN IN');

  // The splash stays for at least a second (as in iOS), then routes.
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1000);
  });

  expect(texts()).toContain('SIGN IN');
});
