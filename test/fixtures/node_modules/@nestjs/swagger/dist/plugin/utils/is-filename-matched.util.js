export const isFilenameMatched = (patterns, filename) => patterns.some((path) => filename.includes(path));
