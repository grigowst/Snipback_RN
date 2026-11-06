// Colours and fonts from the Snipback iOS app (Constants.Colours, UITextField+Extensions).

export const colors = {
  /** Constants.Colours.ThemeColor: rgb(214, 75, 54). */
  themeRed: '#D64B36',
  background: '#000000',
  surface: '#1A1A1A',
  /** Text-field background. */
  field: '#3D3D3D',
  /** UIColor.darkGray: text-field border. */
  border: '#555555',
  /** UIColor.lightGray: text-field text and placeholder. */
  lightGray: '#AAAAAA',
  /** UIColor.gray. */
  midGray: '#808080',
  white: '#FFFFFF',
} as const;

export const fonts = {
  /** Custom display font; registered in react-native.config.js. */
  bazouk: 'BazoukSSK',
} as const;
