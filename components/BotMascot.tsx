import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Mic, Send, MessageSquare, Volume2, Sparkles, Loader2, StopCircle } from 'lucide-react';
import { systemService, getGeminiClient } from '../lib/api';
import { LiveServerMessage, Modality } from '@google/genai';

const EMOJIS = {
  neutral: ['🙂', '😊', '😉', '😗', '😃'],
  happy: ['😁', '😆', '🥰', '😎', '🤩', '🤠', '🥳'],
  thinking: ['🤔', '🧐', '🤨', '🤓'],
  surprised: ['😮', '😲', '🤯', '😵‍💫', '😯'],
  sleeping: ['😴', '💤', '😪'],
  waiting: ['🙄', '👀', '🤐', '🤥'],
  active: ['🫡', '🤗', '😜', '😝', '😛']
};

interface ChatMsg {
    role: 'user' | 'bot';
    text: string;
}

const BotMascot: React.FC = () => {
  // Mascot State
  const [expression, setExpression] = useState('🤖');
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  
  // Chat Interface State
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'live'>('text');
  
  // Text Chat State
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'bot', text: 'Xin chào! Tôi là DHsystem Assistant. Tôi có thể giúp gì cho bạn về hệ thống?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTextThinking, setIsTextThinking] = useState(false);

  // Live Chat State
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isLiveConnecting, setIsLiveConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const mascotRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Refs for Audio Context
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null); // To store Gemini session

  // 1. Mouse Tracking Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!mascotRef.current) return;
      const rect = mascotRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      
      const limit = 35; 
      const sensitivity = 12;
      
      const rotY = Math.max(-limit, Math.min(limit, deltaX / sensitivity)); 
      const rotX = Math.max(-limit, Math.min(limit, -deltaY / sensitivity));

      setRotation({ x: rotX, y: rotY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 2. Expression Cycle Logic
  useEffect(() => {
    const changeExpression = () => {
      if (isHovered || isOpen) return; // Don't change random if busy
      const moodKeys = Object.keys(EMOJIS) as Array<keyof typeof EMOJIS>;
      const randomMood = moodKeys[Math.floor(Math.random() * moodKeys.length)];
      const randomEmoji = EMOJIS[randomMood][Math.floor(Math.random() * EMOJIS[randomMood].length)];
      setExpression(randomEmoji);
    };
    const interval = setInterval(changeExpression, 3500); 
    return () => clearInterval(interval);
  }, [isHovered, isOpen]);

  // 3. Context Speech
  useEffect(() => {
    if (isOpen) {
        setSpeech(null);
        return;
    }
    let msg = '';
    if (location.pathname === '/') msg = 'Hệ thống đã sẵn sàng!';
    else if (location.pathname.includes('knowledge')) msg = 'Đang phân tích dữ liệu...';
    else if (location.pathname === '/settings') msg = 'Cấu hình hệ thống';
    
    if (msg) {
        setSpeech(msg);
        const timer = setTimeout(() => setSpeech(null), 4000);
        return () => clearTimeout(timer);
    }
  }, [location.pathname, isOpen]);

  // Auto scroll chat
  useEffect(() => {
    if (isOpen && activeTab === 'text') {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, activeTab]);

  // --- HANDLERS ---

  const handleMascotClick = () => {
    setIsOpen(!isOpen);
    setSpeech(null);
    if (!isOpen) {
        setExpression('😎');
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isTextThinking) return;

    const userText = inputText;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setInputText('');
    setIsTextThinking(true);

    let botResponse = '';
    try {
        await systemService.chat(userText, (chunk) => {
            botResponse = chunk;
            // Update last message if it's bot, or add new one
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last.role === 'bot' && last.text === '...') {
                     // Replace placeholder
                     return [...prev.slice(0, -1), { role: 'bot', text: chunk }];
                }
                if (last.role === 'user') {
                     return [...prev, { role: 'bot', text: chunk }];
                }
                 // Update existing bot message
                return [...prev.slice(0, -1), { role: 'bot', text: chunk }];
            });
        });
    } catch (err) {
        setMessages(prev => [...prev, { role: 'bot', text: "Xin lỗi, tôi gặp sự cố kết nối." }]);
    } finally {
        setIsTextThinking(false);
    }
  };

  // --- LIVE AUDIO HANDLERS ---
  
  // Audio Utils
  const createBlob = (data: Float32Array) => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    // Encode to base64 manually
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return {
        data: btoa(binary),
        mimeType: 'audio/pcm;rate=16000',
    };
  };

  const decodeAudio = (base64: string) => {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext) => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  };

  const startLiveSession = async () => {
    const ai = getGeminiClient();
    if (!ai) {
        alert("Vui lòng nhập API Key trong phần Cài đặt");
        return;
    }

    try {
        setIsLiveConnecting(true);
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); // Model output is 24k
        audioContextRef.current = ctx;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // Input Pipeline
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Visualizer logic
            let sum = 0;
            for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
            setAudioLevel(Math.sqrt(sum / inputData.length) * 10);

            const pcmBlob = createBlob(inputData);
            if (sessionRef.current) {
                // We assume sessionRef is a promise or object that allows sending
                // For simplicity with this library wrapper, we handle logic below
            }
        };

        source.connect(processor);
        processor.connect(ctx.destination);

        // Output Pipeline
        let nextStartTime = 0;

        // Connect Gemini Live
        const session = await ai.live.connect({
            model: 'gemini-2.0-flash-exp', // Use latest experimental model for live
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: "You are DHsystem Assistant, a helpful robot. You are chatting with a user via voice. Keep answers short and friendly.",
            },
            callbacks: {
                onopen: () => {
                    console.log("Live Connected");
                    setIsLiveConnected(true);
                    setIsLiveConnecting(false);
                    setExpression('😜');
                },
                onmessage: async (msg: LiveServerMessage) => {
                    // Handle Audio Output
                    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                        setExpression('😮'); // Mouth open when speaking
                        const audioBuffer = await decodeAudioData(decodeAudio(audioData), outputCtx);
                        
                        const src = outputCtx.createBufferSource();
                        src.buffer = audioBuffer;
                        src.connect(outputCtx.destination);
                        
                        const now = outputCtx.currentTime;
                        nextStartTime = Math.max(nextStartTime, now);
                        src.start(nextStartTime);
                        nextStartTime += audioBuffer.duration;
                        
                        src.onended = () => setExpression('🙂');
                    }
                },
                onclose: () => {
                    console.log("Live Closed");
                    stopLiveSession();
                },
                onerror: (e) => {
                    console.error("Live Error", e);
                    stopLiveSession();
                }
            }
        });

        sessionRef.current = session;

        // Hook up input to session
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            session.sendRealtimeInput({ media: pcmBlob });
            
            // Visualizer (Simple)
            let sum = 0;
            for(let i=0; i<inputData.length; i+=10) sum += Math.abs(inputData[i]);
            setAudioLevel(sum / (inputData.length/10));
        };

    } catch (err) {
        console.error("Failed to start live", err);
        setIsLiveConnecting(false);
    }
  };

  const stopLiveSession = () => {
    setIsLiveConnected(false);
    setIsLiveConnecting(false);
    setAudioLevel(0);
    
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    // Note: session.close() if available in SDK
    sessionRef.current = null;
    setExpression('🙂');
  };

  return (
    <>
      {/* --- MASCOT CONTAINER --- */}
      <div 
        ref={mascotRef}
        className="fixed bottom-10 right-10 z-[90] flex flex-col items-center pointer-events-auto select-none"
        style={{ perspective: '800px' }}
        onMouseEnter={() => { setIsHovered(true); if(!isOpen) setExpression('😍'); }}
        onMouseLeave={() => { setIsHovered(false); if(!isOpen) setExpression(EMOJIS.neutral[0]); }}
      >
        {/* Floating Bubble Prompt */}
        {!isOpen && speech && (
          <div className="absolute bottom-[110%] mb-2 px-4 py-2 bg-white/90 backdrop-blur text-slate-900 text-sm font-bold rounded-2xl rounded-br-none shadow-xl animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap z-20 border-2 border-white">
            {speech}
          </div>
        )}

        {/* --- CHAT INTERFACE OVERLAY --- */}
        {isOpen && (
            <div className="absolute bottom-[130%] right-0 w-[350px] h-[500px] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-5 duration-200 origin-bottom-right">
                
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="font-semibold text-white text-sm">DHsystem Assistant</span>
                    </div>
                    <button onClick={handleMascotClick} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-slate-900 border-b border-slate-800">
                    <button 
                        onClick={() => { setActiveTab('text'); stopLiveSession(); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === 'text' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <MessageSquare className="w-3 h-3" /> Text Chat
                    </button>
                    <button 
                         onClick={() => setActiveTab('live')}
                         className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === 'live' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Mic className="w-3 h-3" /> Live Voice
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {activeTab === 'text' ? (
                        <div className="h-full flex flex-col">
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                                            {m.text}
                                        </div>
                                    </div>
                                ))}
                                {isTextThinking && (
                                    <div className="flex justify-start">
                                        <div className="bg-slate-800 px-3 py-2 rounded-2xl rounded-tl-sm flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75"></span>
                                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150"></span>
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef}></div>
                            </div>
                            
                            {/* Input */}
                            <form onSubmit={handleSendText} className="p-3 bg-slate-800/30 border-t border-slate-700">
                                <div className="relative">
                                    <input 
                                        autoFocus
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                        placeholder="Hỏi về hệ thống..."
                                        value={inputText}
                                        onChange={e => setInputText(e.target.value)}
                                    />
                                    <button type="submit" disabled={!inputText.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-400 disabled:opacity-50">
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        // LIVE VOICE UI
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-900 to-indigo-950/30">
                            <div className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${isLiveConnected ? 'bg-red-500/10' : 'bg-slate-800'}`}>
                                {/* Pulse Ring */}
                                {isLiveConnected && (
                                    <div 
                                        className="absolute inset-0 rounded-full border border-red-500/50"
                                        style={{ transform: `scale(${1 + audioLevel * 2})`, opacity: 0.5 - audioLevel }}
                                    ></div>
                                )}
                                
                                <div className={`z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-inner transition-colors ${isLiveConnected ? 'bg-gradient-to-br from-red-500 to-pink-600 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'bg-slate-700'}`}>
                                    {isLiveConnected ? <Mic className="w-8 h-8 text-white animate-pulse" /> : <Mic className="w-8 h-8 text-slate-400" />}
                                </div>
                            </div>

                            <h3 className="mt-6 font-semibold text-white text-lg">
                                {isLiveConnecting ? 'Đang kết nối...' : isLiveConnected ? 'Đang nghe...' : 'Live Voice Chat'}
                            </h3>
                            <p className="text-sm text-slate-400 mt-2 max-w-[200px]">
                                {isLiveConnected 
                                    ? 'Nói chuyện trực tiếp với Robot. Hỗ trợ real-time.' 
                                    : 'Nhấn nút bên dưới để bắt đầu cuộc trò chuyện.'}
                            </p>

                            <button 
                                onClick={isLiveConnected ? stopLiveSession : startLiveSession}
                                className={`mt-8 px-6 py-3 rounded-full font-medium text-sm flex items-center gap-2 transition-all active:scale-95 shadow-lg ${
                                    isLiveConnecting ? 'bg-slate-700 cursor-wait text-slate-300' :
                                    isLiveConnected ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                                }`}
                                disabled={isLiveConnecting}
                            >
                                {isLiveConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                                 isLiveConnected ? <><StopCircle className="w-4 h-4" /> Dừng cuộc gọi</> : 
                                 <><Sparkles className="w-4 h-4" /> Bắt đầu</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- 3D ROBOT HEAD --- */}
        <div 
            onClick={handleMascotClick}
            className="relative w-28 h-28 transition-transform duration-100 ease-out cursor-pointer group"
            style={{
                transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
                transformStyle: 'preserve-3d'
            }}
        >
            {/* Glow Aura */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full blur-3xl -z-10 transition-all duration-500 ${isLiveConnected ? 'bg-red-500/30 animate-pulse' : 'bg-yellow-400/20 group-hover:bg-yellow-400/40'}`}></div>

            {/* 3D SPHERE BODY */}
            <div 
                className="absolute inset-0 rounded-full shadow-[inset_-12px_-12px_24px_rgba(161,98,7,0.5),inset_8px_8px_16px_rgba(255,255,255,0.4),0_12px_24px_rgba(0,0,0,0.3)] border-[0.5px] border-yellow-300/30 overflow-hidden"
                style={{
                    background: 'radial-gradient(circle at 35% 30%, #fef08a, #eab308, #a16207)', 
                    transform: 'translateZ(0px)'
                }}
            >
                {/* Specular Highlight */}
                <div className="absolute top-[12%] left-[12%] w-[30%] h-[18%] bg-white/50 blur-md rounded-full -rotate-45"></div>
                {/* Bounce light */}
                <div className="absolute bottom-[8%] right-[15%] w-[40%] h-[20%] bg-yellow-300/30 blur-md rounded-full"></div>
            </div>

            {/* EMOJI FACE */}
            <div 
                className="absolute inset-0 flex items-center justify-center text-7xl drop-shadow-md z-10 select-none"
                style={{ transform: 'translateZ(35px)' }}
            >
                {expression}
            </div>

            {/* SINGLE ANTENNA (No more arms/headphones) */}
            <div 
                className="absolute -top-5 left-1/2 -translate-x-1/2 w-1.5 h-8 bg-gradient-to-b from-slate-300 to-slate-500 rounded-full -z-10"
                style={{ transform: 'translateZ(-15px) rotateX(-10deg)' }}
            >
                 {/* Red LED Tip */}
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.9)] border-2 border-red-300 transition-colors ${isLiveConnected ? 'bg-green-500 border-green-300 shadow-green-500/90 animate-ping' : 'bg-red-500 animate-pulse'}`}></div>
            </div>
        </div>
        
        {/* Ground Shadow */}
        <div className="w-20 h-4 bg-black/30 rounded-[100%] blur-md mt-6 group-hover:scale-75 transition-transform duration-300"></div>
      </div>
    </>
  );
};

export default BotMascot;