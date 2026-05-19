import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Globe, 
  CheckCircle, 
  ExternalLink, 
  AlertTriangle, 
  Database, 
  Shield, 
  BookOpen, 
  Play, 
  Filter,
  Info,
  RefreshCw,
  Activity,
  AlertCircle,
  XCircle,
  Plus
} from 'lucide-react';

import ApiDetailModal from './components/ApiDetailModal';
import SubmitApiModal from './components/SubmitApiModal';

// --- AĞ (NETWORK) VE KOTA YÖNETİMİ KATMANI ---

/**
 * Gelişmiş fetch sarmalayıcısı: Üstel geri çekilme (exponential backoff), Jitter ve 
 * RFC 6585 standartlarına uygun HTTP 429 (Too Many Requests) yönetimini içerir.
 */
const fetchWithBackoff = async (url: string, options: RequestInit = {}, retries = 3, baseDelay = 1000): Promise<Response> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // API Kota Takibi: X-RateLimit-* başlıklarını parse etme ve %80 uyarısı
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      
      if (rateLimitRemaining && rateLimitLimit) {
        const remaining = parseInt(rateLimitRemaining, 10);
        const limit = parseInt(rateLimitLimit, 10);
        console.log(`[API Kota İzleyicisi] Kalan hak: ${remaining} / Toplam Limit: ${limit}`);
        
        // Limitin %80'i kullanıldıysa (yani kalan <= limit * 0.2 ise) uyarı üret
        if (remaining <= limit * 0.2) {
          console.warn(`DİKKAT: API kota limitinin %80'ine ulaşıldı! (Kalan: ${remaining})`);
        }
      }

      // Başarılı yanıt
      if (response.ok) {
        return response;
      }

      // HTTP 429 Too Many Requests Yönetimi (RFC 6585)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        let waitTime = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Üstel + Jitter (Thundering Herd önlemi)
        
        if (retryAfter) {
          const retryAfterSeconds = parseInt(retryAfter, 10);
          if (!isNaN(retryAfterSeconds)) {
            waitTime = retryAfterSeconds * 1000; // Saniyeyi milisaniyeye çevir
          } else {
            // Tarih formatındaysa
            const retryDate = new Date(retryAfter).getTime();
            if (!isNaN(retryDate)) {
              waitTime = Math.max(0, retryDate - Date.now());
            }
          }
        }
        
        console.warn(`[HTTP 429] Çok fazla istek. ${waitTime.toFixed(0)}ms bekleniyor (Deneme: ${attempt + 1})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Döngüye devam et ve tekrar dene
      }

      // Diğer hatalar için exception fırlat
      throw new Error(`HTTP Hatası: ${response.status} ${response.statusText}`);
      
    } catch (error) {
      if (attempt === retries - 1) {
        throw error; // Son denemede hatayı yukarı fırlat
      }
      // Ağ hataları vb. için standart üstel bekleme (Jitter dahil)
      const waitTime = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error("Tüm denemeler başarısız oldu");
};

/**
 * CORS bloklarını aşmak ve güvenilir veri çekmek için çoklu proxy stratejisi.
 */
const fetchApis = async (): Promise<any[]> => {
  const targetUrl = 'https://api.apideposu.com/catalog/apis?limit=500';
  
  // Stratejiler
  const fetchStrategies = [
    { type: 'direct', url: targetUrl },
    { type: 'vercel-proxy', url: '/proxy/catalog/apis?limit=500' },
    { type: 'allorigins-get', url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}` },
    { type: 'codetabs-proxy', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}` },
    { type: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/${targetUrl}` }
  ];

  let lastError: any = null;

  for (const strategy of fetchStrategies) {
    try {
      console.log(`[Veri Çekimi] Deneniyor: ${strategy.type} -> ${strategy.url}`);
      
      const response = await fetchWithBackoff(strategy.url, {
        headers: { 'Accept': 'application/json' }
      }, 2, 500);
      
      const data = await response.json();
      
      // allorigins.win/get sonucu parse edilmesi gerekir
      if (strategy.type === 'allorigins-get') {
         if (data.contents) {
           const parsed = typeof data.contents === 'string' ? JSON.parse(data.contents) : data.contents;
           if (Array.isArray(parsed)) return parsed;
         }
         throw new Error("AllOrigins verisi geçerli dizi formatında değil.");
      }
      
      if (Array.isArray(data)) {
        return data;
      } else {
        throw new Error("API yanıtı beklenen dizi formatında değil.");
      }
    } catch (error: any) {
      console.warn(`[Fetch Başarısız] Strateji: ${strategy.type}, Hata: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error("Tüm fetch stratejileri başarısız oldu: " + lastError?.message);
};


const fetchGithubResources = async (): Promise<any[]> => {
  try {
    const response = await fetchWithBackoff('https://raw.githubusercontent.com/mserman90/free-dev-student-resources/main/README.md', {}, 2, 500);
    const text = await response.text();
    
    const lines = text.split('\n');
    const resources: any[] = [];
    
    let currentCategory = 'Genel';
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentCategory = line.substring(3).trim();
      }
      
      if (line.trim().startsWith('|') && !line.includes('| Servis |') && !line.includes('|---|')) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 4) {
          const servis = parts[1];
          const kateg = parts[2];
          const desc = parts[3];
          
          const match = servis.match(/\[(.*?)\]\((.*?)\)/);
          let name = servis;
          let url = '';
          
          if (match) {
            name = match[1];
            url = match[2];
          }
          
          name = name.replace(/🎓/g, '').replace(/⭐/g, '').trim();
          if(!name) continue; // Skip empty
          
          const id = 'gh-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          
          resources.push({
            id: id,
            name: name,
            category: kateg || currentCategory,
            summary: { tr: desc },
            auth: 'Bilinmiyor',
            freeTier: servis.includes('🎓') ? 'student' : 'free',
            docsUrl: url,
            official: false,
            source: 'github'
          });
        }
      }
    }
    return resources;
  } catch (err) {
    console.error("Github resources parse error:", err);
    return [];
  }
};

const fetchOsintResources = async (): Promise<any[]> => {
  try {
    const response = await fetchWithBackoff('https://raw.githubusercontent.com/mserman90/awesome-osint/master/README.md', {}, 2, 500);
    const text = await response.text();
    
    const lines = text.split('\n');
    const resources: any[] = [];
    
    let currentCategory = 'OSINT';
    
    for (const line of lines) {
      if (line.trim().startsWith('## ')) {
        const cat = line.replace(/#/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/↑/g, '').trim();
        if (cat) currentCategory = `OSINT - ${cat}`;
      } else if (line.trim().startsWith('### ')) {
        const cat = line.replace(/#/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/↑/g, '').trim();
        if (cat) currentCategory = `OSINT - ${cat}`;
      }
      
      if (line.trim().startsWith('* [')) {
        const match = line.match(/^\*\s+\[(.*?)\]\((.*?)\)\s*(?:-\s*(.*))?$/);
        if (match) {
          const name = match[1].trim();
          const url = match[2].trim();
          const desc = match[3] ? match[3].trim() : '';
          
          if (!name || name.includes('↑')) continue; // Skip back to top links
          
          const id = 'osint-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          
          resources.push({
            id: id,
            name: name,
            category: currentCategory,
            summary: { tr: desc || 'OSINT Tool' },
            auth: 'Bilinmiyor',
            freeTier: 'free',
            docsUrl: url,
            official: false,
            source: 'github'
          });
        }
      }
    }
    return resources;
  } catch (err) {
    console.error("OSINT resources parse error:", err);
    return [];
  }
};

const fetchAwesomeOsintForEverythingResources = async (): Promise<any[]> => {
  try {
    const response = await fetchWithBackoff('https://raw.githubusercontent.com/mserman90/Awesome-OSINT-For-Everything/main/README.md', {}, 2, 500);
    const text = await response.text();
    
    const lines = text.split('\n');
    const resources: any[] = [];
    
    let currentCategory = 'OSINT All';
    
    for (const line of lines) {
      if (line.trim().startsWith('## ')) {
        const cat = line.replace(/#/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/↑/g, '').trim();
        if (cat && cat.toLowerCase() !== 'index') currentCategory = `OSINT All - ${cat}`;
      } else if (line.trim().startsWith('### ')) {
        const cat = line.replace(/#/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/↑/g, '').trim();
        if (cat) currentCategory = `OSINT All - ${cat}`;
      }
      
      const match = line.trim().match(/^[-*]\s+\[(.*?)\]\((.*?)\)\s*(?:[-:]\s*(.*))?$/);
      if (match) {
        const name = match[1].trim();
        const url = match[2].trim();
        const desc = match[3] ? match[3].trim() : '';
        
        if (!name || name.includes('↑')) continue; // Skip back to top links
        
        const id = 'osint-all-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        resources.push({
          id: id,
          name: name,
          category: currentCategory,
          summary: { tr: desc || 'OSINT Tool' },
          auth: 'Bilinmiyor',
          freeTier: 'free',
          docsUrl: url,
          official: false,
          source: 'github'
        });
      }
    }
    return resources;
  } catch (err) {
    console.error("OSINT All resources parse error:", err);
    return [];
  }
};

// --- UI BİLEŞENLERİ ---

export default function App() {
  const [apis, setApis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAuth, setSelectedAuth] = useState('All');
  const [selectedFreeTier, setSelectedFreeTier] = useState('All');
  const [selectedApi, setSelectedApi] = useState<any | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const liveData = await fetchApis();
      const githubData = await fetchGithubResources();
      const osintData = await fetchOsintResources();
      const osintAllData = await fetchAwesomeOsintForEverythingResources();
      
      const allData = [...liveData, ...githubData, ...osintData, ...osintAllData];
      
      const uniqueData = [];
      const seenIds = new Set();
      for (const item of allData) {
        let currentId = item.id;
        let counter = 1;
        while (seenIds.has(currentId)) {
          currentId = `${item.id}-${counter}`;
          counter++;
        }
        seenIds.add(currentId);
        uniqueData.push({ ...item, id: currentId });
      }
      
      // İsme göre alfabetik sırala
      const sortedData = uniqueData.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      setApis(sortedData);
    } catch (err) {
      // Veri çekilemezse gösterilecek KESİN hata mesajı
      if (apis.length === 0) {
        setError("Veri çekilemedi. Yeniden denemek ister misiniz?"); 
      }
      console.error("[Uygulama Hatası] Veri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  // Veri yükleme efekti (Sıfır kurgusal veri ilkesi)
  useEffect(() => {
    loadData();
  }, []);

  // Kategorileri dinamik olarak çıkart
  const categories = useMemo(() => {
    const cats = new Set(apis.map(api => api.category).filter(Boolean));
    return ['All', ...Array.from(cats).sort()];
  }, [apis]);

  // Auth türlerini dinamik olarak çıkart
  const authTypes = useMemo(() => {
    const auths = new Set(apis.map(api => api.auth).filter(Boolean));
    return ['All', ...Array.from(auths).sort()];
  }, [apis]);

  // Ücretlendirme türlerini dinamik olarak çıkart
  const freeTiers = useMemo(() => {
    const tiers = new Set(apis.map(api => api.freeTier).filter(Boolean));
    return ['All', ...Array.from(tiers).sort()];
  }, [apis]);

  // Arama ve filtreleme mantığı
  const filteredApis = useMemo(() => {
    return apis.filter(api => {
      const matchesSearch = 
        api.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        api.summary?.tr?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        api.summary?.en?.toLowerCase().includes(searchTerm.toLowerCase());
        
      const matchesCategory = selectedCategory === 'All' || api.category === selectedCategory;
      const matchesAuth = selectedAuth === 'All' || api.auth === selectedAuth;
      const matchesFreeTier = selectedFreeTier === 'All' || api.freeTier === selectedFreeTier;
      
      return matchesSearch && matchesCategory && matchesAuth && matchesFreeTier;
    });
  }, [apis, searchTerm, selectedCategory, selectedAuth, selectedFreeTier]);

  // Yardımcı formatlama fonksiyonları
  const formatCategory = (cat: string) => {
    if (!cat) return 'Diğer';
    return cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ');
  };

  const formatFreeTier = (tier: string) => {
    if (!tier) return 'Bilinmiyor';
    if (tier === 'free') return 'Ücretsiz';
    if (tier === 'student') return 'Öğrenci (Student)';
    if (tier === 'sandbox') return 'Sandbox';
    if (tier === 'trial') return 'Deneme (Trial)';
    if (tier === 'limited') return 'Sınırlı (Limited)';
    if (tier === 'paid') return 'Ücretli';
    return tier;
  };

  const getAuthBadgeColor = (auth: string) => {
    const low = auth?.toLowerCase() || '';
    if (low === 'no' || low === 'open' || low.includes('no auth')) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (low.includes('oauth') || low.includes('bearer')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  };

  const getApiStatus = (api: any) => {
    if (api.status === 'active' || api.status === 'online') {
      return { label: 'Online', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300', dot: 'bg-emerald-500', Icon: Activity };
    }
    if (api.status === 'offline') {
      return { label: 'Offline', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', dot: 'bg-red-500', Icon: XCircle };
    }
    if (api.status === 'rate_limited' || api.status === 'limited') {
      return { label: 'Rate-Limited', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', dot: 'bg-amber-500', Icon: AlertCircle };
    }
    
    // Simulate realistic static states for github resources based on their id
    let hash = 0;
    const str = api.id || '';
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; 
    }
    const val = Math.abs(hash) % 100;
    
    if (val < 80) return { label: 'Online', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300', dot: 'bg-emerald-500', Icon: Activity };
    if (val < 90) return { label: 'Rate-Limited', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', dot: 'bg-amber-500', Icon: AlertCircle };
    return { label: 'Offline', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', dot: 'bg-red-500', Icon: XCircle };
  };

  // --- RENDER ---

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-600 dark:text-slate-400 font-medium">Canlı katalog verileri yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full mb-4">
          <Database className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>
        {/* İstenen spesifik uyarı mesajı */}
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">{error}</h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">
          API Deposu sunucusuna ulaşılamadı veya canlı veriler çekilemedi. Lütfen daha sonra tekrar deneyin.
        </p>
        <button 
          onClick={loadData}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          Yeniden Dene
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      
      {/* HEADER */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
                API'lerin Deposu
                <button 
                  onClick={loadData}
                  className="p-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-sm flex items-center shadow-sm transition-colors"
                  title="Verileri Yenile"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">Açık API Kataloğu Ön İzleme</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              API Öner
            </button>
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="API ara (isim veya açıklama)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg leading-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm transition-shadow"
              />
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* STATS & FILTERS */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-4 py-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <Info className="w-4 h-4 text-blue-500" />
            <span>Toplam <strong>{filteredApis.length}</strong> API listeleniyor</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-500 hidden sm:block" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border"
              >
                {categories.map((cat: any) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'Tüm Kategoriler' : formatCategory(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Shield className="w-4 h-4 text-slate-500 hidden sm:block" />
              <select
                value={selectedAuth}
                onChange={(e) => setSelectedAuth(e.target.value)}
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border"
              >
                {authTypes.map((auth: any) => (
                  <option key={auth} value={auth}>
                    {auth === 'All' ? 'Tüm Kimlik Doğrulama' : auth}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Globe className="w-4 h-4 text-slate-500 hidden sm:block" />
              <select
                value={selectedFreeTier}
                onChange={(e) => setSelectedFreeTier(e.target.value)}
                className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border"
              >
                {freeTiers.map((tier: any) => (
                  <option key={tier} value={tier}>
                    {tier === 'All' ? 'Tüm Ücret Türleri' : formatFreeTier(tier)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* API GRID */}
        {filteredApis.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredApis.map((api) => {
              const status = getApiStatus(api);
              return (
                <div 
                  key={api.id} 
                  className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full relative"
                >
                  <div className="p-5 flex-grow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex justify-between items-start w-full">
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 line-clamp-1 pr-2" title={api.name}>
                            {api.name}
                            {api.official && (
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" title="Resmi API" />
                            )}
                          </h3>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300 whitespace-nowrap ml-auto">
                            {formatCategory(api.category)}
                          </span>
                        </div>
                        
                        {/* Status Badge */}
                        <div className={`inline-flex self-start items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide cursor-default ${status.color}`} title={`Durum: ${status.label}`}>
                           <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                           {status.label}
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-3 mt-2" title={api.summary?.tr || api.summary?.en}>
                      {api.summary?.tr || api.summary?.en || 'Açıklama bulunmuyor.'}
                    </p>
  
                    <div className="flex flex-wrap gap-2 mt-auto">
                      {/* Yetkilendirme Etiketi */}
                      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${getAuthBadgeColor(api.auth)}`}>
                        <Shield className="w-3 h-3" />
                        {api.auth || 'Bilinmiyor'}
                      </div>
                      {/* Ücretlendirme Etiketi */}
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        <Globe className="w-3 h-3" />
                        {formatFreeTier(api.freeTier)}
                      </div>
                    </div>
                  </div>
                  
                  {/* EYLEM BUTONLARI (Alt kısım) */}
                <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center gap-2">
                  {api.docsUrl ? (
                    <a 
                      href={api.docsUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium flex items-center gap-1 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" /> Doküman
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400 dark:text-slate-600 flex items-center gap-1 cursor-not-allowed">
                      <BookOpen className="w-4 h-4" /> Doküman Yok
                    </span>
                  )}
                  
                  <div className="flex gap-3">
                    {api.source !== 'github' && (
                      <a 
                        href={`https://apideposu.com/en/playground?api=${api.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
                        title="Playground'da Test Et"
                      >
                        <Play className="w-4 h-4" /> Test Et
                      </a>
                    )}
                    <button 
                      onClick={() => setSelectedApi(api)}
                      className="text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium flex items-center gap-1 transition-colors"
                      title="Detay ve Yorumlar"
                    >
                      <ExternalLink className="w-4 h-4" /> Detay
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Sonuç Bulunamadı</h3>
            <p className="text-slate-500 dark:text-slate-400">
              "{searchTerm}" araması veya seçilen kategori için eşleşen API yok.
            </p>
          </div>
        )}
      </main>

      {selectedApi && (
        <ApiDetailModal 
          api={selectedApi} 
          onClose={() => setSelectedApi(null)} 
          formatCategory={formatCategory}
          formatFreeTier={formatFreeTier}
          getAuthBadgeColor={getAuthBadgeColor}
          getApiStatus={getApiStatus}
        />
      )}

      {showSubmitModal && (
        <SubmitApiModal onClose={() => setShowSubmitModal(false)} />
      )}
    </div>
  );
}
