import React, { useState, useEffect, useRef } from 'react';
import type { RecommendedPlace, Recommendation } from '../types';
import { RecommendationCard } from './RecommendationCard';
import { ArrowLeftIcon, DownloadIcon } from './IconComponents';
import { MapView } from './MapView';

interface ResultsPageProps {
  recommendation: Recommendation;
  destination: string;
  purposes: string[];
  onBack: () => void;
  onGetMore: () => void;
  isMoreLoading: boolean;
  showMap: boolean;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({ recommendation, destination, purposes, onBack, onGetMore, isMoreLoading, showMap }) => {
  const [focusedPlace, setFocusedPlace] = useState<RecommendedPlace | null>(recommendation.places[0] ?? null);
  const mainContentRef = useRef<HTMLElement>(null);
  const prevPlacesCount = useRef(recommendation.places.length);

  useEffect(() => {
    if (recommendation.places.length > prevPlacesCount.current) {
      const firstNewCard = mainContentRef.current?.children[prevPlacesCount.current];
      if (firstNewCard) {
        // Small delay to allow new elements to render before scrolling
        setTimeout(() => {
          firstNewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }
    prevPlacesCount.current = recommendation.places.length;
  }, [recommendation.places.length]);

  const handleDownload = () => {
    const content = `# '${destination}' 추천 장소\n\n## 목적: ${purposes.join(', ')}\n\n---\n\n` +
    recommendation.places.map(place => {
        let placeContent = `### ${place.placeName}\n\n`;
        placeContent += `*   **설명**: ${place.description}\n`;
        placeContent += `*   **좌표**: ${place.latitude}, ${place.longitude}\n`;
        placeContent += `*   **하이라이트**: ${place.highlights.map(h => `#${h}`).join(' ')}\n`;
        placeContent += `*   **지도**: [Google Maps 링크](${place.googleMapsUrl})\n`;
        if (place.reviewUrl) {
          placeContent += `*   **후기**: [블로그/리뷰 링크](${place.reviewUrl})\n`;
        }
        return placeContent;
    }).join('\n---\n\n');

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `추천장소_${destination.replace(/ /g, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
    
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4 sm:p-6 md:p-8 font-sans animate-fade-in">
      <div className="w-full max-w-4xl mx-auto">
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 mb-10">
          <div className="flex justify-start">
            <button 
              onClick={onBack} 
              aria-label="뒤로가기"
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors duration-200"
            >
               <ArrowLeftIcon />
            </button>
          </div>

          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400">
              '{destination}' 추천 장소
            </h1>
            <p className="text-slate-300 mt-2">'{purposes.join(', ')}' 목적에 맞춰 AI가 찾아낸 장소입니다.</p>
          </div>
          
           <div className="flex justify-end">
             <button 
              onClick={handleDownload} 
              aria-label="결과 다운로드"
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors duration-200"
            >
               <DownloadIcon />
            </button>
          </div>
        </header>
        
        {showMap && <MapView place={focusedPlace} />}

        <main ref={mainContentRef} className="space-y-4">
          {recommendation.places.map((place, index) => {
              const isFocused = showMap && focusedPlace?.googleMapsUrl === place.googleMapsUrl;
              return (
                <div
                  key={place.googleMapsUrl + index}
                  style={{ animationDelay: `${index * 100}ms` }}
                  className={`animate-fade-in-up opacity-0 rounded-xl transition-all duration-300 ${isFocused ? 'ring-2 ring-sky-500/80' : ''}`}
                  onMouseEnter={() => { if(showMap) setFocusedPlace(place) }}
                >
                    <RecommendationCard place={place} destination={destination} />
                </div>
              )
            })
          }
        </main>
        
        <div className="text-center mt-8">
            <button
                onClick={onGetMore}
                disabled={isMoreLoading}
                className={`px-6 py-2 font-semibold rounded-full transition-all duration-300 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed ${isMoreLoading ? 'animate-subtle-pulse' : ''}`}
            >
                {isMoreLoading ? '다른 장소 찾는 중...' : '다른 장소 더 추천받기'}
            </button>
        </div>
      </div>
       <footer className="text-center mt-8 text-gray-500 text-sm">
        Powered by Google Gemini
      </footer>
    </div>
  );
};