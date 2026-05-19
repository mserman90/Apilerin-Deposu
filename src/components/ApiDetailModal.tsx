import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { X, Star, MessageSquare, BookOpen, ExternalLink, Play, CheckCircle, Shield, Globe } from 'lucide-react';

interface Feedback {
  id: string;
  rating: number;
  comment?: string;
  userName?: string;
  createdAt: any;
}

interface ApiDetailModalProps {
  api: any;
  onClose: () => void;
  formatCategory: (cat: string) => string;
  formatFreeTier: (tier: string) => string;
  getAuthBadgeColor: (auth: string) => string;
}

export default function ApiDetailModal({ api, onClose, formatCategory, formatFreeTier, getAuthBadgeColor }: ApiDetailModalProps) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [userName, setUserName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.id]);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'feedbacks'),
        where('apiId', '==', api.id),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const feedbackList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Feedback[];
      setFeedbacks(feedbackList);
    } catch (error) {
      console.error("Geri bildirimler çekilemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) return;
    
    try {
      setSubmitting(true);
      await addDoc(collection(db, 'feedbacks'), {
        apiId: api.id,
        rating,
        comment,
        userName: userName || 'Anonim',
        createdAt: serverTimestamp()
      });
      
      setComment('');
      setRating(5);
      // Puan eklendikten sonra listeyi yenile
      await fetchFeedbacks();
    } catch (error) {
      console.error("Geri bildirim gönderilemedi:", error);
      alert("Geri bildirim gönderilirken bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  };

  const avgRating = feedbacks.length > 0 
    ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
    : '0.0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-700">
        
        {/* Modal Header */}
        <div className="flex justify-between items-start p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {api.name}
              {api.official && <CheckCircle className="w-5 h-5 text-green-500" title="Resmi API" />}
            </h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                {formatCategory(api.category)}
              </span>
              <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${getAuthBadgeColor(api.auth)}`}>
                <Shield className="w-3 h-3" />
                {api.auth || 'Bilinmiyor'}
              </div>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                <Globe className="w-3 h-3" />
                {formatFreeTier(api.freeTier)}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Sol Kolon: Detaylar */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">API Hakkında</h3>
              <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                {api.summary?.tr || api.summary?.en || 'Detaylı bir açıklama bulunmuyor.'}
              </p>

              <div className="flex flex-col gap-3">
                {api.docsUrl && (
                  <a href={api.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-blue-600 dark:text-blue-400 hover:underline">
                    <BookOpen className="w-5 h-5" /> Resmi Dokümantasyon
                  </a>
                )}
                {api.source !== 'github' && (
                  <>
                    <a href={`https://apideposu.com/en/playground?api=${api.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-blue-600 dark:text-blue-400 hover:underline">
                      <Play className="w-5 h-5" /> Playground'da Test Et
                    </a>
                    <a href={`https://apideposu.com/en/catalog/${api.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-400 hover:underline">
                      <ExternalLink className="w-5 h-5" /> Orijinal API Deposu Sayfası
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Sağ Kolon: Geri Bildirimler */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500 fill-current" />
                  Geri Bildirimler
                </h3>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">
                  {avgRating} / 5.0
                </div>
              </div>

              {/* Geri Bildirim Formu */}
              <form onSubmit={handleSubmit} className="mb-8 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3">Kendi Puanınızı Ekleyin</h4>
                <div className="mb-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`p-1 focus:outline-none transition-colors ${rating >= star ? 'text-yellow-500' : 'text-slate-300 dark:text-slate-600'}`}
                      >
                        <Star className={`w-6 h-6 ${rating >= star ? 'fill-current' : ''}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <input 
                  type="text"
                  placeholder="İsminiz (Opsiyonel)"
                  className="w-full mb-3 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
                <textarea
                  placeholder="Bu API hakkında ne düşünüyorsunuz?"
                  className="w-full mb-3 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-20 text-slate-900 dark:text-white"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                ></textarea>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
                >
                  {submitting ? 'Gönderiliyor...' : 'Geri Bildirim Gönder'}
                </button>
              </form>

              {/* Yorum Listesi */}
              <div className="space-y-4">
                {loading ? (
                  <p className="text-sm text-slate-500 text-center py-4">Yorumlar yükleniyor...</p>
                ) : feedbacks.length > 0 ? (
                  feedbacks.map(fb => (
                    <div key={fb.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{fb.userName || 'Anonim'}</span>
                        <div className="flex gap-0.5 text-yellow-500">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`w-3.5 h-3.5 ${i < fb.rating ? 'fill-current' : 'text-slate-200 dark:text-slate-700'}`} />
                          ))}
                        </div>
                      </div>
                      {fb.comment && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          {fb.comment}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 border-dashed">
                    Henüz yorum yapılmamış. İlk değerlendiren siz olun!
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
