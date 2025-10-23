
import React, { useState, useCallback, useEffect, memo } from 'react';
import type { Recommendation, UserProfile } from './types';
import { analyzeUserPreferences, getRecommendationsForDestination, getDynamicPurposes, verifyLocation } from './services/geminiService';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ResultsPage } from './components/ResultsPage';
import { GlobeIcon, UploadIcon } from './components/IconComponents';

type AppPhase = 'initial' | 'profiling' | 'ready' | 'loading';
type AppView = 'main' | 'results';

interface RecommendationRequest {
  destination: string;
  purposes: string[];
  includeReviews: boolean;
  additionalInfo: string;
}

const placePurposes = [
  '훌륭한 식사', '로컬 맛집', '디저트/베이커리', '이색 주점',
  '조용한 휴식', '스파/마사지', '자연 속 힐링',
  '대표 랜드마크', '숨겨진 명소', '멋진 야경',
  '명품/백화점', '소품샵/편집샵', '전통 시장',
  '하이킹/등산', '해양 스포츠', '테마파크',
  '미술관/박물관', '공연/전시', '건축물 투어',
  '감성 카페', '스페셜티 커피',
  '아이와 함께', '인생샷 명소',
];

interface PurposeButtonProps {
    purpose: string;
    isSelected: boolean;
    isDynamic: boolean;
    onClick: (purpose: string) => void;
}

const PurposeButton = memo(({ purpose, isSelected, isDynamic, onClick }: PurposeButtonProps) => {
    const handleClick = () => onClick(purpose);

    let baseClasses, selectedClasses, unselectedClasses;

    if (isDynamic) {
        baseClasses = 'px-3 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200';
        selectedClasses = 'bg-cyan-500 text-white border-cyan-500';
        unselectedClasses = 'bg-transparent border-cyan-700 text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-600';
    } else {
        baseClasses = 'px-3 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200';
        selectedClasses = 'bg-sky-600 text-white border-sky-600';
        unselectedClasses = 'bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500';
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`${baseClasses} ${isSelected ? selectedClasses : unselectedClasses}`}
        >
            {isDynamic && '✨ '}
            {purpose}
        </button>
    );
});


const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('initial');
  const [view, setView] = useState<AppView>('main');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDestination, setCurrentDestination] = useState<string>('');
  const [lastRequest, setLastRequest] = useState<RecommendationRequest | null>(null);
  const [isMoreLoading, setIsMoreLoading] = useState<boolean>(false);

  // Form state
  const [destination, setDestination] = useState<string>('');
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [customPurpose, setCustomPurpose] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [includeReviews, setIncludeReviews] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [additionalInfo, setAdditionalInfo] = useState<string>('');
  const [dynamicPurposes, setDynamicPurposes] = useState<string[]>([]);
  
  // State for real-time location verification
  const [isVerifyingLocation, setIsVerifyingLocation] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifiedDestination, setVerifiedDestination] = useState<string | null>(null);

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDestination(e.target.value);
    // Reset verification when user types again
    setVerifiedDestination(null);
    setVerificationError(null);
    setDynamicPurposes([]);
  };

  const handleDestinationBlur = useCallback(async () => {
    // Only verify if there's text and it's not already verified
    if (destination.trim().length > 1 && !verifiedDestination) {
      setIsVerifyingLocation(true);
      setVerificationError(null);

      try {
        const verificationResult = await verifyLocation(destination);
        if (verificationResult.isValid) {
          const correctedDest = verificationResult.correctedDestination;
          setDestination(correctedDest); // Update input with corrected name for clarity
          setVerifiedDestination(correctedDest);
          // Get dynamic purposes only after successful verification
          getDynamicPurposes(correctedDest).then(setDynamicPurposes);
        } else {
          setVerificationError(verificationResult.error || "입력한 장소를 찾을 수 없습니다. 다시 시도해주세요.");
        }
      } catch (err) {
        console.error("Error verifying location:", err);
        setVerificationError("장소를 확인하는 중 오류가 발생했습니다.");
      } finally {
        setIsVerifyingLocation(false);
      }
    }
  }, [destination, verifiedDestination]);

  useEffect(() => {
    if (customPurpose.trim() === '') {
        setSuggestions([]);
        return;
    }

    const allPurposes = [...new Set([...dynamicPurposes, ...placePurposes])];
    const filtered = allPurposes.filter(p =>
        p.toLowerCase().includes(customPurpose.toLowerCase()) &&
        !selectedPurposes.includes(p) && // Don't suggest already selected purposes
        p.toLowerCase() !== customPurpose.toLowerCase() // Don't suggest the exact match
    );

    setSuggestions(filtered);
  }, [customPurpose, dynamicPurposes, selectedPurposes]);
  
  const handleSuggestionClick = (suggestion: string) => {
    setCustomPurpose(suggestion);
    setSuggestions([]); // Hide suggestions after selection
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setPhase('profiling');

    try {
      const fileContent = await file.text();
      const parsedJson = JSON.parse(fileContent);

      let features: any[];
      if (Array.isArray(parsedJson)) {
        features = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object' && Array.isArray(parsedJson.features)) {
        features = parsedJson.features;
      } else {
        throw new Error("올바른 지도 데이터 파일이 아닙니다. 파일에 장소 목록이 없습니다.");
      }
      
      const extractPlaceName = (feature: any): string | null => {
        if (!feature?.properties) return null;
        if (feature.geometry?.coordinates?.[0] === 0 && feature.geometry?.coordinates?.[1] === 0) return null;
        const props = feature.properties;
        if (props.location?.name) return props.location.name;
        if (props.Title && typeof props.Title === 'string' && props.Title.trim().toLowerCase() !== 'dropped pin') return props.Title;
        const location = props.Location || props.location;
        if (location) {
          if (location['Business Name'] && typeof location['Business Name'] === 'string') return location['Business Name'];
          if (location.name && typeof location.name === 'string') return location.name;
        }
        const url = props.google_maps_url || props['Google Maps URL'];
        if (url && typeof url === 'string') {
            try {
                const match = url.match(/\/place\/([^/@?]+)/);
                if (match?.[1]) {
                  const placeName = decodeURIComponent(match[1].replace(/\+/g, ' '));
                  if (placeName.trim().toLowerCase() !== 'dropped pin') return placeName;
                }
                const urlObj = new URL(url);
                const q = urlObj.searchParams.get('q');
                if (q) {
                    const placeName = q.split(',')[0].trim();
                     if (placeName.toLowerCase() !== 'dropped pin') return placeName;
                }
            } catch(e) { console.warn("Could not parse Google Maps URL", url, e); }
        }
        if (location) {
            const address = location.address || location.Address;
            if (address && typeof address === 'string') return address.split(',').slice(0, 2).join(', ');
        }
        return null;
      };

      const placeNames = features.map(extractPlaceName).filter((name): name is string => name !== null && name.trim() !== '');
      if (placeNames.length === 0) throw new Error("파일에서 장소 정보를 찾을 수 없습니다. 파일 내용을 확인하거나 다른 파일을 시도해주세요.");
      
      const profile = await analyzeUserPreferences(placeNames);
      setUserProfile(profile);
      setPhase('ready');

    } catch (err: any) {
      console.error("File processing error:", err);
      setError(err.message || "파일을 처리하는 중 오류가 발생했습니다.");
      setPhase('initial');
    } finally {
        event.target.value = '';
    }
  }, []);

  const handleSkipProfiling = () => {
    setUserProfile({
      tags: [],
      description: '사용자의 특정 취향이 입력되지 않았습니다. 요청된 목적에 맞는 일반적인 추천을 제공합니다.'
    });
    setPhase('ready');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalPurposes = [customPurpose, ...selectedPurposes].filter(p => p && p.trim() !== '');
    
    setError(null);

    if (!verifiedDestination) {
      setError(verificationError || "유효한 장소를 먼저 입력하고 확인해주세요.");
      document.getElementById('destination')?.focus();
      return;
    }
    
    if (!userProfile || finalPurposes.length === 0) {
      setError("여행 목적을 1개 이상 선택하거나 입력해주세요.");
      document.getElementById('custom-purpose')?.focus();
      return;
    }

    setPhase('loading');
    setRecommendation(null);
    
    const correctedDestination = verifiedDestination;
    setCurrentDestination(correctedDestination);
    
    const requestData: RecommendationRequest = { destination: correctedDestination, purposes: finalPurposes, includeReviews, additionalInfo };
    setLastRequest(requestData);

    try {
      const result = await getRecommendationsForDestination(userProfile, requestData.destination, requestData.purposes, requestData.includeReviews, requestData.additionalInfo);
      setRecommendation(result);
      setView('results');
    } catch (err) {
      console.error(err);
      setError("추천을 생성하는 중 오류가 발생했습니다.");
    } finally {
      setPhase('ready');
    }
  };
  
  const handleGetMoreRecommendations = async () => {
    if (!userProfile || !lastRequest) return;
    
    setIsMoreLoading(true);
    setError(null);

    const existingPlaceNames = recommendation?.places.map(p => p.placeName) ?? [];

    try {
      const result = await getRecommendationsForDestination(
        userProfile,
        lastRequest.destination,
        lastRequest.purposes,
        lastRequest.includeReviews,
        lastRequest.additionalInfo,
        existingPlaceNames
      );
      setRecommendation(prev => ({
        places: [...(prev?.places ?? []), ...result.places]
      }));
    } catch (err) {
      console.error(err);
      setError("추가 추천을 생성하는 중 오류가 발생했습니다.");
    } finally {
      setIsMoreLoading(false);
    }
  };
  
  const handleStartOver = () => {
    setPhase('initial');
    setView('main');
    setUserProfile(null);
    setRecommendation(null);
    setError(null);
    setDestination('');
    setSelectedPurposes([]);
    setCustomPurpose('');
    setIncludeReviews(false);
    setShowMap(false);
    setAdditionalInfo('');
  };

  const handleBackToMain = () => {
    setView('main');
    setRecommendation(null);
  };

  const handlePurposeClick = useCallback((purpose: string) => {
    setSelectedPurposes(prev => 
      prev.includes(purpose) ? prev.filter(p => p !== purpose) : [...prev, purpose]
    );
  }, []);
  
  if (view === 'results' && recommendation && lastRequest) {
    return (
        <ResultsPage
            recommendation={recommendation}
            onBack={handleBackToMain}
            destination={currentDestination}
            purposes={lastRequest.purposes}
            onGetMore={handleGetMoreRecommendations}
            isMoreLoading={isMoreLoading}
            showMap={showMap}
        />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4 sm:p-6 md:p-8 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <div className="flex justify-center items-center gap-4 mb-2">
            <GlobeIcon />
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400">
              AI 장소 추천
            </h1>
          </div>
          <p className="text-slate-300 text-lg">
            당신의 구글맵 데이터로 숨겨진 취향을 찾아, 완벽한 장소를 추천해 드립니다.
          </p>
        </header>

        <main className="bg-slate-900/50 rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-800">
          {phase === 'initial' && (
            <section className="text-center animate-fade-in">
              <h2 className="text-2xl font-semibold mb-4 text-slate-100">나의 취향 분석하기</h2>
              <div className="text-left bg-slate-800/80 p-4 rounded-lg border border-slate-700 max-w-2xl mx-auto mb-6">
                <p className="text-slate-200 mb-2 font-medium">Google Takeout에서 '저장한 장소' 데이터를 업로드하여 당신의 취향을 알려주세요.</p>
                <ol className="list-decimal list-inside text-slate-400 text-sm space-y-1">
                    <li><a href="https://takeout.google.com/settings/takeout" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Google Takeout</a>으로 이동하여 '지도(내 장소 포함)'만 선택합니다.</li>
                    <li>'JSON' 형식으로 내보낸 후, '저장한 장소.json' 파일을 업로드해주세요.</li>
                </ol>
              </div>

               <label htmlFor="file-upload" className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-800/50 hover:border-sky-500/80 hover:bg-slate-800/80 transition-colors duration-300">
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                  <UploadIcon />
                  <p className="mb-2 text-sm text-slate-300"><span className="font-semibold text-sky-400">파일 선택</span> 또는 드래그 & 드롭</p>
                  <p className="text-xs text-slate-500">'저장한 장소.json' 파일을 업로드하세요</p>
                </div>
              </label>

              <input id="file-upload" type="file" className="hidden" accept=".json" onChange={handleFileUpload} />
              
              <div className="relative flex items-center justify-center my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-900/50 px-3 text-sm text-slate-400">또는</span>
                </div>
              </div>

              <button
                onClick={handleSkipProfiling}
                className="w-full max-w-sm mx-auto px-6 py-2.5 text-base font-semibold rounded-full transition-all duration-300 bg-slate-700 text-slate-200 hover:bg-slate-600"
              >
                취향 입력 없이 시작하기
              </button>

               {error && <p className="text-red-400 text-center mt-4">{error}</p>}
            </section>
          )}

          {phase === 'profiling' && <div className="min-h-[200px] flex justify-center items-center"><LoadingSpinner message="당신의 장소 취향을 깊이 있게 분석하고 있습니다..." /></div>}

          {userProfile && (phase === 'ready' || phase === 'loading') && (
            <section className="animate-fade-in">
              <div className="bg-slate-800/50 p-5 rounded-lg mb-8 border border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-xl font-semibold text-white">나의 장소 취향</h2>
                        <p className="text-slate-300 mt-2 text-base">{userProfile.description}</p>
                      </div>
                      <button onClick={handleStartOver} className="text-sm text-slate-400 hover:text-white hover:underline flex-shrink-0 ml-4">
                          취향 업데이트
                      </button>
                  </div>
                  {userProfile.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {userProfile.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 text-sm font-medium rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 transition-transform hover:scale-105">
                                {tag}
                            </span>
                        ))}
                    </div>
                  )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                <h2 className="text-2xl font-semibold text-slate-100 text-center">새로운 장소 추천받기</h2>
                
                <div>
                  <label htmlFor="destination" className="block text-lg font-semibold text-slate-200 mb-2">어디로 떠나시나요?</label>
                  <div className="relative">
                    <input
                      id="destination" type="text" value={destination}
                      onChange={handleDestinationChange}
                      onBlur={handleDestinationBlur}
                      placeholder="도시나 지역을 알려주세요 (예: 성수동)"
                      className={`w-full bg-slate-800 text-white placeholder-slate-500 rounded-md px-4 py-2 border transition-colors outline-none 
                        ${verificationError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' 
                        : 'border-slate-700 focus:border-sky-400 focus:ring-sky-400/50'}
                        ${verifiedDestination && !verificationError ? 'border-green-500 focus:border-green-500 focus:ring-green-500/50' : ''}`}
                      required
                    />
                    {isVerifyingLocation && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                  </div>
                   {verificationError && <p className="text-red-400 text-sm mt-1">{verificationError}</p>}
                   {verifiedDestination && !verificationError && !isVerifyingLocation && (
                      <p className="text-green-400 text-sm mt-1">✓ 장소 확인 완료</p>
                   )}
                </div>
                
                <div>
                  <label htmlFor="custom-purpose" className="block text-lg font-semibold text-slate-200 mb-2">무엇을 하고 싶으신가요?</label>
                  <div className="relative mb-3">
                    <input
                      id="custom-purpose"
                      type="text"
                      value={customPurpose}
                      onChange={(e) => setCustomPurpose(e.target.value)}
                      placeholder="원하는 활동이나 분위기를 자유롭게 입력하세요"
                      autoComplete="off"
                      className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-md px-4 py-2 border border-slate-700 focus:border-sky-400 focus:ring focus:ring-sky-400/50 outline-none transition-colors"
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-10 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-md max-h-60 overflow-y-auto shadow-lg">
                            {suggestions.map(suggestion => (
                                <li
                                    key={suggestion}
                                    className="px-4 py-2 text-slate-200 hover:bg-sky-900/50 cursor-pointer"
                                    onMouseDown={() => handleSuggestionClick(suggestion)}
                                >
                                    {suggestion}
                                </li>
                            ))}
                        </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dynamicPurposes.map(purpose => (
                        <PurposeButton
                          key={`dyn-${purpose}`}
                          purpose={purpose}
                          isSelected={selectedPurposes.includes(purpose)}
                          onClick={handlePurposeClick}
                          isDynamic={true}
                        />
                      ))}
                    {placePurposes.map(purpose => (
                      <PurposeButton
                        key={purpose}
                        purpose={purpose}
                        isSelected={selectedPurposes.includes(purpose)}
                        onClick={handlePurposeClick}
                        isDynamic={false}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="additional-info" className="block text-lg font-semibold text-slate-200 mb-2">추가 요청사항 (선택)</label>
                   <textarea
                    id="additional-info" value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)}
                    rows={3}
                    placeholder="꼭 가고 싶은 곳, 피하고 싶은 곳, 최신 트렌드 장소 등 자유롭게 알려주세요."
                    className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-md px-4 py-2 border border-slate-700 focus:border-sky-400 focus:ring focus:ring-sky-400/50 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:space-y-0 space-y-2 sm:justify-start sm:space-x-6">
                  <div className="flex items-center">
                    <input
                      id="include-reviews"
                      type="checkbox"
                      checked={includeReviews}
                      onChange={(e) => setIncludeReviews(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
                    />
                    <label htmlFor="include-reviews" className="ml-2 block text-sm text-slate-200">
                      장소별 최신 블로그 후기 링크 포함
                    </label>
                  </div>
                   <div className="flex items-center">
                    <input
                      id="show-map"
                      type="checkbox"
                      checked={showMap}
                      onChange={(e) => setShowMap(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
                    />
                    <label htmlFor="show-map" className="ml-2 block text-sm text-slate-200">
                      결과를 지도에 표시하기
                    </label>
                  </div>
                </div>

                <div className="text-center pt-4">
                  <button
                    type="submit"
                    disabled={phase === 'loading'}
                    className="px-8 py-3 text-lg font-bold rounded-full transition-all duration-300 bg-sky-600 text-white hover:bg-sky-500 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20"
                  >
                    {phase === 'loading' ? 'AI가 장소를 찾고 있습니다...' : 'AI 장소 추천받기'}
                  </button>
                </div>
                 {error && <p className="text-red-400 text-center mt-4">{error}</p>}
              </form>
            </section>
          )}
        </main>
      </div>
      <footer className="text-center mt-8 text-gray-500 text-sm">
        Powered by Google Gemini
      </footer>
    </div>
  );
};

export default App;
