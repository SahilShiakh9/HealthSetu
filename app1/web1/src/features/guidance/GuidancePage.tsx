import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GuidanceTopic, Language } from '@healthsetu/contracts';
import {
  searchGuidance,
  GUIDANCE_DISCLAIMER,
  seedGuidanceCache,
} from './guidanceEngine';
import { speechService } from '../../services/speechService';
import { compressImage, saveCompressedImageToDb, type CompressedImageResult } from '../../utils/imageCompressor';
import { HealthcareImage } from '../../components/HealthcareImage';
import { BookOpen } from 'lucide-react';

export const GuidancePage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language as Language) || 'en';

  const [searchQuery, setSearchQuery] = useState('');
  const [topics, setTopics] = useState<GuidanceTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<GuidanceTopic | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechMockNote, setSpeechMockNote] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);

  // Image attachment state
  const [attachedImage, setAttachedImage] = useState<CompressedImageResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    // Seed offline cache and load initial topics
    seedGuidanceCache();
    setTopics(searchGuidance('', currentLang));
  }, [currentLang]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    const results = searchGuidance(query, currentLang);
    setTopics(results);
    if (selectedTopic && !results.some((r) => r.id === selectedTopic.id)) {
      setSelectedTopic(null);
    }
  };

  const handleQuickTopicClick = (query: string) => {
    handleSearchChange(query);
  };

  // Voice recognition handler
  const handleVoiceInput = () => {
    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    setSpeechMockNote(null);

    speechService.startListening(currentLang, {
      onResult: (result) => {
        setSearchQuery(result.transcript);
        const results = searchGuidance(result.transcript, currentLang);
        setTopics(results);
        if (result.isMock) {
          setSpeechMockNote(
            currentLang === 'mr'
              ? 'सिम्युलेटेड व्हॉइस इनपुट वापरले (आवाज ओळख चाचणी)'
              : currentLang === 'hi'
              ? 'सिम्युलेटेड वॉयस इनपुट प्रयुक्त (ध्वनि पहचान परीक्षण)'
              : 'Voice recognition simulated (low-bandwidth fallback)'
          );
        }
      },
      onError: (err) => {
        setIsListening(false);
        console.warn('Voice error:', err);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  // Text to speech playback
  const handleToggleSpeak = (topic: GuidanceTopic) => {
    if (isSpeaking === topic.id) {
      speechService.stopSpeaking();
      setIsSpeaking(null);
      return;
    }

    const titleText = topic.title[currentLang] || topic.title.en;
    const summaryText = topic.summary[currentLang] || topic.summary.en;
    const stepsText = topic.keySteps
      .map((s) => `Step ${s.step}: ${s.text[currentLang] || s.text.en}`)
      .join('. ');

    const fullText = `${titleText}. ${summaryText}. ${stepsText}`;
    setIsSpeaking(topic.id);
    speechService.speakText(fullText, currentLang);
  };

  // Image upload and client compression
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setImageError(null);

    try {
      const compressed = await compressImage(file, file.name);
      await saveCompressedImageToDb(compressed);
      setAttachedImage(compressed);
    } catch (err: any) {
      setImageError(err?.message || 'Failed to compress image');
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] p-4 sm:p-6 lg:p-8 pb-24">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 text-[#6B7280] hover:text-[#D95D24] min-h-[48px] px-3.5 py-2 rounded-xl bg-white border border-[#F0E2D8] hover:bg-[#FFF0E6] transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm font-medium">{t('common.back')}</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>100% Offline Available</span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="bg-white border border-[#F0E2D8] rounded-3xl p-5 sm:p-6 shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            <div className="md:col-span-7 space-y-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF0E6] text-[#D95D24] text-xs font-bold tracking-wide uppercase">
                <BookOpen className="w-4 h-4" />
                <span>Rural Health Literacy & First Aid</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#242424] tracking-tight">
                {currentLang === 'mr'
                  ? 'आरोग्य मार्गदर्शक आणि प्रथमोपचार'
                  : currentLang === 'hi'
                  ? 'स्वास्थ्य मार्गदर्शिका और प्राथमिक उपचार'
                  : 'SwasthSetu Guidance & First Aid'}
              </h1>
              <p className="text-sm md:text-base text-[#6B7280] leading-relaxed">
                {currentLang === 'mr'
                  ? 'ओआरएस, सर्पदंश, गरोदरपण आणि लसीकरणावर त्वरित खात्रीशीर माहिती. इंटरनेट नसतानाही पूर्णपणे उपलब्ध.'
                  : currentLang === 'hi'
                  ? 'ओआरएस, सांप के काटने, गर्भावस्था और टीकाकरण पर तुरंत प्रमाणित जानकारी। ऑफलाइन भी पूरी तरह काम करता है।'
                  : 'Verified clinical protocols for ORS rehydration, snakebites, pregnancy danger signs, burns, and immunization. Fully functional without internet.'}
              </p>
            </div>
            <div className="md:col-span-5">
              <HealthcareImage
                src="/images/first_aid_guidance.jpg"
                alt="First Aid Guidance"
                aspectRatio="16/9"
                className="rounded-2xl max-h-44 shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Search Bar with Voice Input */}
        <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#6B7280]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={
                  currentLang === 'mr'
                    ? 'लक्षणे किंवा प्रश्न विचारा (उदा. ओआरएस, सर्पदंश, खोकला...)'
                    : currentLang === 'hi'
                    ? 'सवाल या लक्षण खोजें (जैसे ओआरएस, सांप का काटना, टीबी...)'
                    : 'Search topic or ask a question (e.g. ORS, snakebite, burns...)'
                }
                className="w-full bg-[#FFF9F5] border border-[#F0E2D8] rounded-xl pl-12 pr-4 py-3 text-[#242424] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#F47738] focus:border-[#F47738] text-sm md:text-base min-h-[48px]"
              />
              {searchQuery && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#6B7280] hover:text-[#242424] cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Voice Mic Button */}
            <button
              onClick={handleVoiceInput}
              title="Speak your question"
              className={`min-h-[48px] min-w-[48px] px-3.5 py-3 rounded-xl border flex items-center justify-center transition shadow-xs cursor-pointer ${
                isListening
                  ? 'bg-red-600 border-red-500 text-white animate-pulse'
                  : 'bg-[#F47738] hover:bg-[#D95D24] border-transparent text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </div>

          {/* Voice Listening indicator */}
          {isListening && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span>
                {currentLang === 'mr'
                  ? 'ऐकत आहे... बोला (मराठी/हिंदी/इंग्रजी)'
                  : currentLang === 'hi'
                  ? 'सुन रहे हैं... बोलिए (हिंदी/मराठी/अंग्रेजी)'
                  : 'Listening... Please speak your health query'}
              </span>
            </div>
          )}

          {speechMockNote && (
            <div className="p-2.5 bg-[#FFF0E6] border border-[#F0E2D8] rounded-xl text-xs text-[#D95D24] flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0 text-[#F47738]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{speechMockNote}</span>
            </div>
          )}

          {/* Suggested Quick Topic Pills */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
              {currentLang === 'mr' ? 'वारंवार विचारले जाणारे विषय' : currentLang === 'hi' ? 'सामान्य प्रश्न' : 'Frequent Topics'}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'जीवनरक्षक घोल (ORS)', query: 'ors' },
                { label: 'साप चावणे (Snakebite)', query: 'snakebite' },
                { label: 'गरोदरपण धोके (Maternal)', query: 'pregnancy' },
                { label: 'लसीकरण (Vaccine)', query: 'vaccination' },
                { label: 'भाजल्यास (Burns)', query: 'burn' },
                { label: 'क्षयरोग (TB)', query: 'tb' },
                { label: 'डेंग्यू / मलेरिया', query: 'dengue' },
                { label: 'पोषण (Nutrition)', query: 'nutrition' },
              ].map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickTopicClick(pill.query)}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#FFF0E6] border border-[#F0E2D8] hover:border-[#F47738] text-[#242424] hover:text-[#D95D24] text-xs font-medium transition min-h-[36px] cursor-pointer"
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Image Attachment & 200KB Compression Section */}
        <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#FFF0E6] text-[#D95D24]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#242424]">
                  {currentLang === 'mr'
                    ? 'छायाचित्र जोडा (जखम / पुरळ / औषध पत्र)'
                    : currentLang === 'hi'
                    ? 'फोटो संलग्न करें (घाव / दाने / पर्ची)'
                    : 'Attach Clinical Photo (Wound / Rash / Prescription)'}
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Client-side downscaled to &le; 200 KB &bull; EXIF stripped for privacy
                </p>
              </div>
            </div>

            <label className="cursor-pointer min-h-[48px] px-4 py-2.5 rounded-xl bg-[#FFF0E6] hover:bg-[#F0E2D8] border border-[#F0E2D8] text-[#D95D24] text-xs font-semibold flex items-center gap-2 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{isCompressing ? 'Compressing...' : 'Upload Photo'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                disabled={isCompressing}
                className="hidden"
              />
            </label>
          </div>

          {imageError && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
              {imageError}
            </p>
          )}

          {attachedImage && (
            <div className="p-3 bg-[#FFF9F5] border border-[#F0E2D8] rounded-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={attachedImage.previewUrl}
                  alt="Clinical attachment"
                  className="w-14 h-14 object-cover rounded-lg border border-[#F0E2D8]"
                />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-[#242424] truncate max-w-[200px]">
                    {attachedImage.fileName}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Compressed: {(attachedImage.compressedSizeBytes / 1024).toFixed(1)} KB (from {(attachedImage.originalSizeBytes / 1024).toFixed(1)} KB)
                  </p>
                  <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                    {Math.round(attachedImage.compressionRatio * 100)}% Bandwidth Saved &bull; Safe for 2G
                  </span>
                </div>
              </div>

              <button
                onClick={() => setAttachedImage(null)}
                className="text-xs text-red-600 hover:text-red-700 p-2 min-h-[40px] cursor-pointer"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Topics List or Selected Topic Details */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#242424]">
              {currentLang === 'mr' ? 'मार्गदर्शन विषय' : currentLang === 'hi' ? 'मार्गदर्शिका विषय' : 'Guidance Topics'} ({topics.length})
            </h2>
            {selectedTopic && (
              <button
                onClick={() => setSelectedTopic(null)}
                className="text-xs text-[#D95D24] hover:underline min-h-[36px] font-bold cursor-pointer"
              >
                View all topics
              </button>
            )}
          </div>

          {topics.length === 0 ? (
            <div className="bg-white border border-[#F0E2D8] rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#FFF0E6] text-[#D95D24] flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#242424]">No matching guidance found</h3>
              <p className="text-sm text-[#6B7280] max-w-sm mx-auto">
                Try searching for simple symptoms like 'fever', 'loose motion', 'pregnancy', or 'snakebite'.
              </p>
              <button
                onClick={() => handleSearchChange('')}
                className="px-4 py-2 rounded-xl bg-[#F47738] hover:bg-[#D95D24] text-white text-xs font-semibold cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : selectedTopic ? (
            // Expanded Topic View
            <div className="bg-white border border-[#F0E2D8] rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="px-2.5 py-1 rounded-md bg-[#FFF0E6] text-[#D95D24] text-xs font-semibold">
                    {selectedTopic.category.replace('_', ' ')}
                  </span>
                  <h3 className="text-xl md:text-2xl font-bold text-[#242424]">
                    {selectedTopic.title[currentLang] || selectedTopic.title.en}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleSpeak(selectedTopic)}
                    title="Audio playback"
                    className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
                      isSpeaking === selectedTopic.id
                        ? 'bg-amber-600 border-amber-500 text-white animate-pulse'
                        : 'bg-white hover:bg-[#FFF0E6] border-[#F0E2D8] text-[#242424]'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                    <span>{isSpeaking === selectedTopic.id ? 'Pause' : 'Listen'}</span>
                  </button>

                  <button
                    onClick={() => setSelectedTopic(null)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#242424] text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Emergency Warning Banner if present */}
              {selectedTopic.emergencyWarning && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-red-900 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-bold text-red-800 uppercase tracking-wide">
                        Emergency Warning
                      </h4>
                      <p className="text-xs md:text-sm mt-0.5 leading-relaxed text-red-900">
                        {selectedTopic.emergencyWarning[currentLang] || selectedTopic.emergencyWarning.en}
                      </p>
                    </div>
                  </div>

                  <a
                    href="tel:108"
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap shadow-md transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Dial 108 Ambulance</span>
                  </a>
                </div>
              )}

              {/* Summary */}
              <div className="p-4 rounded-xl bg-[#FFF9F5] border border-[#F0E2D8]">
                <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                  Overview
                </h4>
                <p className="text-sm text-[#242424] leading-relaxed">
                  {selectedTopic.summary[currentLang] || selectedTopic.summary.en}
                </p>
              </div>

              {/* Step by Step Action Plan */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#D95D24] uppercase tracking-wider">
                  Step-by-Step Action Protocol
                </h4>
                <div className="space-y-2.5">
                  {selectedTopic.keySteps.map((step) => (
                    <div
                      key={step.step}
                      className="p-3.5 rounded-xl bg-[#FFF9F5] border border-[#F0E2D8] flex items-start gap-3.5"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#FFF0E6] border border-[#F0E2D8] text-[#D95D24] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {step.step}
                      </div>
                      <p className="text-sm text-[#242424] leading-relaxed">
                        {step.text[currentLang] || step.text.en}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Do's and Don'ts if available */}
              {(selectedTopic.dos || selectedTopic.donts) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {selectedTopic.dos && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <h5 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Things to DO</span>
                      </h5>
                      <ul className="space-y-1.5">
                        {selectedTopic.dos.map((item, i) => (
                          <li key={i} className="text-xs text-emerald-900 leading-relaxed flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">&bull;</span>
                            <span>{item[currentLang] || item.en}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedTopic.donts && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                      <h5 className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Things NOT to DO</span>
                      </h5>
                      <ul className="space-y-1.5">
                        {selectedTopic.donts.map((item, i) => (
                          <li key={i} className="text-xs text-rose-900 leading-relaxed flex items-start gap-1.5">
                            <span className="text-rose-600 font-bold">&bull;</span>
                            <span>{item[currentLang] || item.en}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons: Consult or Find Facility */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={() => navigate('/consult/choose')}
                  className="w-full sm:flex-1 min-h-[48px] py-3 px-4 rounded-xl bg-[#F47738] hover:bg-[#D95D24] font-semibold text-sm text-white flex items-center justify-center gap-2 transition shadow-md shadow-[#F47738]/25 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Consult a Doctor Online</span>
                </button>

                <button
                  onClick={() => navigate('/facilities')}
                  className="w-full sm:flex-1 min-h-[48px] py-3 px-4 rounded-xl bg-white hover:bg-[#FFF0E6] border border-[#F0E2D8] font-semibold text-sm text-[#242424] hover:text-[#D95D24] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span>Find Nearest PHC / Hospital</span>
                </button>
              </div>
            </div>
          ) : (
            // Grid of Topics
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  onClick={() => setSelectedTopic(topic)}
                  className="bg-white hover:border-[#F47738]/50 border border-[#F0E2D8] rounded-2xl p-5 cursor-pointer transition shadow-xs space-y-3 flex flex-col justify-between group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF0E6] text-[#D95D24]">
                        {topic.category.replace('_', ' ')}
                      </span>
                      {topic.emergencyWarning && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          <span>Emergency Protocol</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-[#242424] group-hover:text-[#D95D24] transition">
                      {topic.title[currentLang] || topic.title.en}
                    </h3>

                    <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                      {topic.summary[currentLang] || topic.summary.en}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#F0E2D8] flex items-center justify-between text-xs text-[#6B7280]">
                    <span className="font-semibold text-[#D95D24] flex items-center gap-1">
                      <span>View Protocol</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSpeak(topic);
                      }}
                      className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-[#FFF0E6] text-[#6B7280] hover:text-[#D95D24] transition-colors cursor-pointer"
                      title="Audio playback"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Statutory Medical Disclaimer per Section 11.6 */}
        <div className="p-4 rounded-xl bg-white border border-[#F0E2D8] text-[#6B7280] text-xs space-y-1 leading-relaxed shadow-xs">
          <p className="font-semibold text-[#242424] uppercase tracking-wider text-[11px]">
            Statutory Clinical & Public Health Disclaimer
          </p>
          <p>{GUIDANCE_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
};
