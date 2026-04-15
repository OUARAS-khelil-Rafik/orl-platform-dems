import type { SyntheticEvent } from 'react';

export const VIDEO_FALLBACK_SRC = '/media-fallback-video.svg';
export const AVATAR_FALLBACK_SRC = '/media-fallback-avatar.svg';
export const IMAGE_FALLBACK_SRC = '/media-fallback-image.svg';

export const applyImageFallback = (
  event: SyntheticEvent<HTMLImageElement, Event>,
  fallbackSrc: string,
) => {
  const image = event.currentTarget;
  if (!image || image.dataset.fallbackApplied === '1') {
    return;
  }

  image.dataset.fallbackApplied = '1';
  image.src = fallbackSrc;
  image.srcset = '';
};
