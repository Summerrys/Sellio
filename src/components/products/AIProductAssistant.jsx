import React, { useImperativeHandle, useRef } from 'react';
import { deleteImageFromStorage } from '@/lib/imageStorage';
import AIProductAssistantInner from './AIProductAssistantInner';

export const cleanupDeletedImages = async (componentRef) => {
  if (componentRef?.current?.deletedImagesRef?.current?.length > 0) {
    const urls = componentRef.current.deletedImagesRef.current;
    componentRef.current.deletedImagesRef.current = [];
    const promises = urls.map(url => deleteImageFromStorage(url));
    await Promise.all(promises);
  }
};

function AIProductAssistantComponent(props, ref) {
  const innerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    get deletedImagesRef() { return innerRef.current?.deletedImagesRef; },
    getTempUploadedPaths: () => innerRef.current?.getTempUploadedPaths?.() ?? [],
    clearTempUploadedPaths: () => innerRef.current?.clearTempUploadedPaths?.(),
  }));

  return <AIProductAssistantInner {...props} innerRef={innerRef} />;
}

const AIProductAssistant = React.forwardRef(AIProductAssistantComponent);
export default AIProductAssistant;