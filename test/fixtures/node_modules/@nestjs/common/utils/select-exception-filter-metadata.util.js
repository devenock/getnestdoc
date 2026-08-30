export const selectExceptionFilterMetadata = (filters, exception) => filters.find(({ exceptionMetatypes }) => !exceptionMetatypes.length ||
    exceptionMetatypes.some(ExceptionMetaType => exception instanceof ExceptionMetaType));
