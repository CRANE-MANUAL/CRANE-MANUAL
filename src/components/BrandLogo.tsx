import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { isValidImageSrc } from '../lib/firebase';

export const APP_ICON_SRC = '/assets/aistudio/5561-removebg-preview_612823cf.png';

export function CraneLogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <img
      src={APP_ICON_SRC}
      alt=""
      aria-hidden="true"
      className={`${className} object-contain select-none`}
    />
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
      <CraneLogoMark className={compact ? 'w-9 h-9 shrink-0' : 'w-11 h-11 shrink-0'} />
      <span className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white text-base sm:text-lg">
        CRANE MANUAL
      </span>
    </span>
  );
}

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  onErrorStateChange?: (hasError: boolean) => void;
}

export function SafeImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackTitle = 'CRANE MANUAL',
  onErrorStateChange,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const valid = isValidImageSrc(src, true);

  if (!src || !valid || failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-sky-50 to-blue-100 dark:from-slate-800 dark:via-slate-900 dark:to-blue-950/60 text-slate-500 dark:text-slate-400 p-4 text-center">
        {failed ? (
          <>
            <ImageOff className="w-6 h-6 mb-1.5 text-slate-400 dark:text-slate-500" />
            <span className="text-xs font-medium line-clamp-1">画像を読み込めませんでした</span>
          </>
        ) : (
          <>
            <CraneLogoMark className="w-14 h-14 opacity-90 mb-1.5" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-1">
              {fallbackTitle}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onLoad={() => onErrorStateChange?.(false)}
      onError={() => {
        setFailed(true);
        onErrorStateChange?.(true);
      }}
    />
  );
}
