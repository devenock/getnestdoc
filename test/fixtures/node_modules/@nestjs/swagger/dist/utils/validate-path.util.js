export const validatePath = (inputPath) => inputPath.charAt(0) !== '/' ? '/' + inputPath : inputPath;
