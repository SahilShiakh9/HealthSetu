import React, { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface HealthcareImageProps {
  src?: string;
  alt: string;
  aspectRatio?: '16/9' | '4/3' | '1/1' | '21/9' | 'auto';
  className?: string;
  placeholderLabel?: string;
  priority?: boolean;
}

export const HealthcareImage: React.FC<HealthcareImageProps> = ({
  src,
  alt,
  aspectRatio = '16/9',
  className = '',
  placeholderLabel = 'Healthcare visual',
  priority = false,
}) => {
  const [hasError, setHasError] = useState(!src);
  const [isLoaded, setIsLoaded] = useState(false);

  const aspectClass =
    aspectRatio === '16/9'
      ? 'aspect-video'
      : aspectRatio === '4/3'
      ? 'aspect-[4/3]'
      : aspectRatio === '1/1'
      ? 'aspect-square'
      : aspectRatio === '21/9'
      ? 'aspect-[21/9]'
      : '';

  if (hasError || !src) {
    return (
      <div
        className={`w-full ${aspectClass} rounded-2xl bg-[#FFF0E6] border border-[#F0E2D8] flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
        aria-label={alt}
        role="img"
      >
        <div className="w-10 h-10 rounded-xl bg-white/80 border border-[#F0E2D8] flex items-center justify-center text-[#F47738] mb-2 shadow-xs">
          <ImageIcon className="w-5 h-5" />
        </div>
        <span className="text-xs font-semibold text-[#242424]">{placeholderLabel}</span>
        <span className="text-[10px] text-[#6B7280] mt-0.5">HealthSetu Visual Resource</span>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full ${aspectClass} overflow-hidden rounded-2xl bg-[#FFF0E6] border border-[#F0E2D8] shadow-xs ${className}`}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-[#FFF0E6] animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center text-[#F47738]/50">
            <ImageIcon className="w-4 h-4" />
          </div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};

export default HealthcareImage;
