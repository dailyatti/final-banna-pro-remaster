import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ApiKeyContextType {
    apiKey: string | null;
    setApiKey: (key: string) => void;
    clearApiKey: () => void;
    isKeyValid: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const ApiKeyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [apiKey, setApiKeyState] = useState<string | null>(null);
    const [isKeyValid, setIsKeyValid] = useState(false);

    useEffect(() => {
        // Load from local storage on mount
        const storedKey = localStorage.getItem('GEMINI_API_KEY');
        if (storedKey) {
            setApiKeyState(storedKey);
            setIsKeyValid(true); // Basic check: exists. Could validate with a dummy call.
        }
    }, []);

    const setApiKey = (key: string) => {
        if (!key.trim()) return;
        localStorage.setItem('GEMINI_API_KEY', key);
        setApiKeyState(key);
        setIsKeyValid(true);
    };

    const clearApiKey = () => {
        localStorage.removeItem('GEMINI_API_KEY');
        setApiKeyState(null);
        setIsKeyValid(false);
    };

    return (
        <ApiKeyContext.Provider value={{ apiKey, setApiKey, clearApiKey, isKeyValid }}>
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
