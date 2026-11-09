'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

async function fetchDetections(key: string): Promise<Record<string, string>> {
  const res = await fetch(`/api/detect?ids=${encodeURIComponent(key)}`);
  if (!res.ok) return {};
  return ((await res.json()) as { detected: Record<string, string> }).detected;
}

/** NEAR AI's reading of which posts make a prediction: post id to the claim. */
export function usePostDetections(postIds: string[]) {
  const key = postIds.join(',');
  return useQuery({
    queryKey: ['post-detections', key],
    queryFn: () => fetchDetections(key),
    enabled: postIds.length > 0,
    staleTime: Infinity,
    retry: false,
    placeholderData: keepPreviousData,
  });
}
