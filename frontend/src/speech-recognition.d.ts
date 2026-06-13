declare var SpeechRecognition: {
    new (): SpeechRecognition;
    prototype: SpeechRecognition;
};

declare var webkitSpeechRecognition: {
    new (): SpeechRecognition;
    prototype: SpeechRecognition;
};

interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    length: number;
    [index: number]: SpeechRecognitionAlternative;
    isFinal: boolean;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: (this: SpeechRecognition, ev: SpeechRecognitionEvent) => any;
    onerror: (this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any;
    onend: (this: SpeechRecognition, ev: Event) => any;
    start(): void;
    stop(): void;
    abort(): void;
}
