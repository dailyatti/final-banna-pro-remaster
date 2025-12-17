import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ImageProvider } from '../types';

interface ApiKeyContextType {
    // Gemini
    geminiApiKey: string | null;
    setGeminiApiKey: (key: string) => void;
    clearGeminiApiKey: () => void;
    isGeminiKeyValid: boolean;

    // OpenAI
    openaiApiKey: string | null;
    setOpenaiApiKey: (key: string) => void;
    clearOpenaiApiKey: () => void;
    isOpenaiKeyValid: boolean;

    // Provider Selection
    activeProvider: ImageProvider;
    setActiveProvider: (provider: ImageProvider) => void;

    // Convenience getters
    apiKey: string | null; // Returns active provider's key
    isKeyValid: boolean;   // Returns active provider's validity

    // Legacy compatibility
    setApiKey: (key: string) => void; // Sets Gemini key for backward compatibility
    clearApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const ApiKeyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Gemini State
    const [geminiApiKey, setGeminiApiKeyState] = useState<string | null>(null);
    const [isGeminiKeyValid, setIsGeminiKeyValid] = useState(false);

    // OpenAI State
    const [openaiApiKey, setOpenaiApiKeyState] = useState<string | null>(null);
    const [isOpenaiKeyValid, setIsOpenaiKeyValid] = useState(false);

    // Provider State
    const [activeProvider, setActiveProviderState] = useState<ImageProvider>('gemini');

    useEffect(() => {
        // Load from local storage on mount
        const storedGeminiKey = localStorage.getItem('GEMINI_API_KEY');
        const storedOpenaiKey = localStorage.getItem('OPENAI_API_KEY');
        const storedProvider = localStorage.getItem('ACTIVE_PROVIDER') as ImageProvider;

        if (storedGeminiKey) {
            setGeminiApiKeyState(storedGeminiKey);
            setIsGeminiKeyValid(true);
        }

        if (storedOpenaiKey) {
            setOpenaiApiKeyState(storedOpenaiKey);
            setIsOpenaiKeyValid(true);
        }

        if (storedProvider === 'openai' || storedProvider === 'gemini') {
            setActiveProviderState(storedProvider);
        }
    }, []);

    // Gemini Methods
    const setGeminiApiKey = (key: string) => {
        if (!key.trim()) return;
        localStorage.setItem('GEMINI_API_KEY', key);
        setGeminiApiKeyState(key);
        setIsGeminiKeyValid(true);
    };

    const clearGeminiApiKey = () => {
        localStorage.removeItem('GEMINI_API_KEY');
        setGeminiApiKeyState(null);
        setIsGeminiKeyValid(false);
    };

    // OpenAI Methods
    const setOpenaiApiKey = (key: string) => {
        if (!key.trim()) return;
        localStorage.setItem('OPENAI_API_KEY', key);
        setOpenaiApiKeyState(key);
        setIsOpenaiKeyValid(true);
    };

    const clearOpenaiApiKey = () => {
        localStorage.removeItem('OPENAI_API_KEY');
        setOpenaiApiKeyState(null);
        setIsOpenaiKeyValid(false);
    };

    // Provider Methods
    const setActiveProvider = (provider: ImageProvider) => {
        localStorage.setItem('ACTIVE_PROVIDER', provider);
        setActiveProviderState(provider);
    };

    // Convenience Getters
    const apiKey = activeProvider === 'openai' ? openaiApiKey : geminiApiKey;
    const isKeyValid = activeProvider === 'openai' ? isOpenaiKeyValid : isGeminiKeyValid;

    // Legacy Compatibility
    const setApiKey = setGeminiApiKey;
    const clearApiKey = clearGeminiApiKey;

    return (
        <ApiKeyContext.Provider value={{
            // Gemini
            geminiApiKey,
            setGeminiApiKey,
            clearGeminiApiKey,
            isGeminiKeyValid,
            // OpenAI
            openaiApiKey,
            setOpenaiApiKey,
            clearOpenaiApiKey,
            isOpenaiKeyValid,
            // Provider
            activeProvider,
            setActiveProvider,
            // Convenience
            apiKey,
            isKeyValid,
            // Legacy
            setApiKey,
            clearApiKey
        }}>
            {children}
        </ApiKeyContext.Provider>
    );
};

export const useApiKey = () => {
    const context = useContext(ApiKeyContext);
    if (context === undefined) {
        throw new Error('useApiKey must be used within an ApiKeyProvider');
    }
    return context;
};
