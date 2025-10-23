import React, { useState, memo } from 'react';
import type { RecommendedPlace, PlaceDetails } from '../types';
import { MapPinIcon, SparklesIcon, ReviewIcon, ClockIcon, AmenitiesIcon, DishesIcon } from './IconComponents';
import { getPlaceDetails, getRichPlaceDetails } from '../services/geminiService';

interface RecommendationCardProps {
  place: RecommendedPlace;
  destination: string;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = memo(({ place, destination }) => {
  // State for free-form Q&A
  const [isQnaVisible, setIsQnaVisible] = useState(false);
  const [qnaQuestion, setQnaQuestion] = useState('');
  const [qnaAnswer, setQnaAnswer] = useState('');
  const [isQnaLoading, setIsQnaLoading] = useState(false);
  
  // State for structured rich details
  const [richDetails, setRichDetails] = useState<PlaceDetails | null>(null);
  const [isRichDetailsVisible, setIsRichDetailsVisible] = useState(false);
  const [isRichDetailsLoading, setIsRichDetailsLoading] = useState(false);
  const [richDetailsError, setRichDetailsError] = useState<string | null>(null);
  
  const handleQnaToggle = () => {
    setIsQnaVisible(prev => !prev);
    setQnaAnswer('');
    setQnaQuestion('');
  };

  const handleQnaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qnaQuestion.trim()) return;
    
    setIsQnaLoading(true);
    setQnaAnswer('');
    
    const answer = await getPlaceDetails(place.placeName, destination, qnaQuestion);
    
    setQnaAnswer(answer);
    setIsQnaLoading(false);
  };

  const handleRichDetailsToggle = async () => {
    // If we're just closing it
    if (isRichDetailsVisible) {
        setIsRichDetailsVisible(false);
        return;
    }

    // Show the section immediately
    setIsRichDetailsVisible(true);
    setRichDetailsError(null);

    // If opening for the first time, fetch data
    if (!richDetails) {
        setIsRichDetailsLoading(true);
        try {
            const detailsData = await getRichPlaceDetails(place.placeName, destination);
            setRichDetails(detailsData);
        } catch (e) {
            console.error("Failed to fetch rich details:", e);
            setRichDetailsError('상세 정보를 가져오는 데 실패했습니다. 잠시 후 다시 시도해주세요.');
            setRichDetails(null);
        } finally {
            setIsRichDetailsLoading(false);
        }
    }
  };

  return (
    <div className="w-full bg-slate-800/70 rounded-xl p-6 border border-slate-700 transition-all duration-300 hover:border-sky-500/50 hover:bg-slate-700/50 shadow-lg hover:shadow-2xl hover:shadow-sky-900/50 hover:-translate-y-1">
      <div className="flex justify-between items-start">
        <a
          href={place.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex-grow"
        >
          <h3 className="text-xl font-bold text-slate-100 group-hover:text-sky-400 transition-colors duration-200 mb-1">
            {place.placeName}
          </h3>
        </a>
        <button onClick={handleQnaToggle} className="p-2 rounded-full text-slate-400 hover:text-sky-300 hover:bg-slate-700 transition-colors duration-200" title="AI에게 더 물어보기">
          <SparklesIcon />
        </button>
      </div>

       {place.distance && (
        <p className="flex items-center gap-1.5 text-sm text-slate-400 mb-3">
          <MapPinIcon />
          <span>{place.distance}</span>
        </p>
      )}

      <p className="text-slate-200 mb-4">{place.description}</p>
      
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {place.highlights.map((highlight, index) => (
          <span key={index} className="px-3 py-1 text-xs font-medium rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
            # {highlight}
          </span>
        ))}
        {place.reviewUrl && (
          <a
            href={place.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <ReviewIcon />
            블로그 후기
          </a>
        )}
      </div>

      <button onClick={handleRichDetailsToggle} className="text-sm font-semibold text-sky-400 hover:text-sky-300 hover:underline transition-colors">
        {isRichDetailsVisible ? '간략히' : '자세히 보기'}
      </button>

      {isRichDetailsVisible && (
        <div className="mt-4 pt-4 border-t border-slate-700 animate-fade-in">
          {isRichDetailsLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
                <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <span>상세 정보를 불러오는 중...</span>
            </div>
          ) : richDetailsError ? (
            <p className="text-sm text-red-400">{richDetailsError}</p>
          ) : richDetails ? (
            <div className="space-y-4 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                    <div className="text-sky-400 mt-0.5"><ClockIcon /></div>
                    <div>
                        <strong className="font-semibold text-slate-100">영업 시간</strong>
                        <p>{richDetails.openingHours}</p>
                    </div>
                </div>

                {richDetails.popularAmenities && richDetails.popularAmenities.length > 0 && (
                    <div className="flex items-start gap-3">
                        <div className="text-sky-400 mt-0.5"><AmenitiesIcon /></div>
                        <div>
                            <strong className="font-semibold text-slate-100">주요 편의시설</strong>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {richDetails.popularAmenities.map(item => <span key={item} className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-600/50 text-slate-300">{item}</span>)}
                            </div>
                        </div>
                    </div>
                )}
                
                {richDetails.popularDishes && richDetails.popularDishes.length > 0 && (
                     <div className="flex items-start gap-3">
                        <div className="text-sky-400 mt-0.5"><DishesIcon /></div>
                        <div>
                            <strong className="font-semibold text-slate-100">인기 메뉴</strong>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {richDetails.popularDishes.map(item => <span key={item} className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-600/50 text-slate-300">{item}</span>)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
          ) : null}
        </div>
      )}
      
      {isQnaVisible && (
        <div className="mt-4 pt-4 border-t border-slate-700 animate-fade-in">
          <form onSubmit={handleQnaSubmit} className="flex gap-2">
            <input 
              type="text"
              value={qnaQuestion}
              onChange={(e) => setQnaQuestion(e.target.value)}
              placeholder="이 장소에 대해 더 물어보세요..."
              className="flex-grow bg-slate-900 text-white placeholder-slate-500 rounded-md px-3 py-1.5 text-sm border border-slate-600 focus:border-sky-400 focus:ring focus:ring-sky-400/50 outline-none transition-colors"
            />
            <button type="submit" disabled={isQnaLoading} className="px-3 py-1.5 text-sm font-semibold rounded-md transition-all duration-200 bg-sky-600 text-white hover:bg-sky-500 disabled:bg-slate-600">
              {isQnaLoading ? '...' : '질문'}
            </button>
          </form>
          {qnaAnswer && (
             <div className="mt-3 text-sm bg-sky-900/30 p-3 rounded-md border border-sky-900/50">
               <p className="text-sky-200">{qnaAnswer}</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
});
