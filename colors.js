// 30 carefully selected colors for order statuses
// Each color is chosen for good contrast, readability, and visual distinction
const STATUS_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#d32f2f', // Red
  '#7b1fa2', // Purple
  '#00796b', // Teal
  '#c2185b', // Pink
  '#5d4037', // Brown
  '#455a64', // Blue Grey
  '#ff6f00', // Amber
  '#2e7d32', // Dark Green
  '#c62828', // Dark Red
  '#1565c0', // Dark Blue
  '#6a1b9a', // Dark Purple
  '#00695c', // Dark Teal
  '#ad1457', // Dark Pink
  '#3e2723', // Dark Brown
  '#263238', // Dark Blue Grey
  '#ff8f00', // Light Amber
  '#4caf50', // Light Green
  '#ff5722', // Deep Orange
  '#9c27b0', // Light Purple
  '#00bcd4', // Cyan
  '#ff9800', // Light Orange
  '#795548', // Light Brown
  '#607d8b', // Light Blue Grey
  '#e91e63', // Light Pink
  '#3f51b5', // Indigo
  '#009688', // Light Teal
  '#ffc107', // Yellow
  '#8bc34a', // Light Green
  '#ffeb3b'  // Light Yellow
];

// Function to get a unique color for a status
function getStatusColor(statusName, existingColors = {}) {
  // If status already has a color, return it
  if (existingColors[statusName]) {
    return existingColors[statusName];
  }
  
  // Find the first unused color
  const usedColors = Object.values(existingColors);
  const availableColor = STATUS_COLORS.find(color => !usedColors.includes(color));
  
  // If all colors are used, cycle through them
  return availableColor || STATUS_COLORS[Object.keys(existingColors).length % STATUS_COLORS.length];
}

// Function to get color by name (for backward compatibility)
function getColorByName(colorName) {
  const colorMap = {
    'red': '#d32f2f',
    'green': '#388e3c',
    'yellow': '#ffc107',
    'blue': '#1976d2',
    'light blue': '#00bcd4',
    'light green': '#4caf50',
    'light pink': '#e91e63',
    'orange': '#f57c00',
    'purple': '#7b1fa2',
    'teal': '#00796b',
    'pink': '#c2185b',
    'brown': '#5d4037',
    'blue grey': '#455a64',
    'amber': '#ff6f00',
    'dark green': '#2e7d32',
    'dark red': '#c62828',
    'dark blue': '#1565c0',
    'dark purple': '#6a1b9a',
    'dark teal': '#00695c',
    'dark pink': '#ad1457',
    'dark brown': '#3e2723',
    'dark blue grey': '#263238',
    'light amber': '#ff8f00',
    'deep orange': '#ff5722',
    'light purple': '#9c27b0',
    'cyan': '#00bcd4',
    'light orange': '#ff9800',
    'light brown': '#795548',
    'light blue grey': '#607d8b',
    'indigo': '#3f51b5',
    'light teal': '#009688',
    'light yellow': '#ffeb3b'
  };
  
  return colorMap[colorName] || colorName;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STATUS_COLORS, getStatusColor, getColorByName };
} 