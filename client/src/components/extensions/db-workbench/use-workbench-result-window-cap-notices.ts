import { useCallback, useRef } from "react";

export interface WorkbenchResultWindowCapNotices {
  hasShownWindowCapNotice: (batchIndex: number) => boolean;
  markWindowCapNoticeShown: (batchIndex: number) => void;
  clearShownWindowCapNotices: () => void;
}

export function useWorkbenchResultWindowCapNotices(): WorkbenchResultWindowCapNotices {
  const shownBatchIndexesRef = useRef<Set<number>>(new Set());

  const hasShownWindowCapNotice = useCallback((batchIndex: number) => {
    return shownBatchIndexesRef.current.has(batchIndex);
  }, []);

  const markWindowCapNoticeShown = useCallback((batchIndex: number) => {
    shownBatchIndexesRef.current.add(batchIndex);
  }, []);

  const clearShownWindowCapNotices = useCallback(() => {
    shownBatchIndexesRef.current.clear();
  }, []);

  return {
    hasShownWindowCapNotice,
    markWindowCapNoticeShown,
    clearShownWindowCapNotices,
  };
}
