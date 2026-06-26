// Tracks the most recently focused bottom-tab other than a given one, so screens
// like Activity (which can be opened from Home or Account) can send the user
// back to the tab they came from.

let previousTab: string = 'Home';
let currentTab: string = 'Home';

export const recordTabFocus = (name: string) => {
  if (name === currentTab) return;
  previousTab = currentTab;
  currentTab = name;
};

export const getPreviousTab = (notThis: string): string => {
  if (previousTab && previousTab !== notThis) return previousTab;
  return 'Home';
};
