"use client";

import { useState, useEffect, useRef } from "react";

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
}

const Pupil = ({ 
  size = 8, 
  maxDistance = 4,
  pupilColor = "black",
}: PupilProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };

    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;

    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;

    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    return { x, y };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
};

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
}

const EyeBall = ({ 
  size = 20, 
  pupilSize = 8, 
  maxDistance = 5,
  eyeColor = "white",
  pupilColor = "black",
  isBlinking = false,
}: EyeBallProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const calculatePupilPosition = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };

    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;

    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;

    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    return { x, y };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{
        width: `${size}px`,
        height: isBlinking ? '2px' : `${size}px`,
        backgroundColor: eyeColor,
        overflow: 'hidden',
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
    </div>
  );
};

interface AnimatedCharactersProps {
  isHoveringButton?: string | null;
}

export default function AnimatedCharacters({ isHoveringButton = null }: AnimatedCharactersProps) {
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isYellowBlinking, setIsYellowBlinking] = useState(false);
  const [isBlueBlinking, setIsBlueBlinking] = useState(false);
  const [isOrangeBlinking, setIsOrangeBlinking] = useState(false);

  // Blinking effect for purple character
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => {
          setIsPurpleBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };

    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Blinking effect for yellow character
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsYellowBlinking(true);
        setTimeout(() => {
          setIsYellowBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };

    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Blinking effect for blue character
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsBlueBlinking(true);
        setTimeout(() => {
          setIsBlueBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };

    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Blinking effect for orange character
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsOrangeBlinking(true);
        setTimeout(() => {
          setIsOrangeBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };

    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Determine if characters should look at each other or up based on hover
  const shouldLookUp = isHoveringButton !== null;
  const shouldLookAtEachOther = isHoveringButton === 'generate';
  const shouldLookAway = isHoveringButton === 'logout';

  return (
    <div className="relative flex items-end justify-center" style={{ width: '360px', height: '240px' }}>
      {/* Purple character - Far left (tallest and wide) */}
      <div 
        className="absolute bottom-0 ease-out"
        style={{
          left: '0px',
          width: '110px',
          height: shouldLookAtEachOther ? '205px' : '200px',
          backgroundColor: shouldLookAway ? '#d4cfff' : '#b8b3f5',
          borderRadius: '10px 10px 0 0',
          zIndex: 2,
          transform: shouldLookAway ? 'skewX(-6deg)' : shouldLookAtEachOther ? 'skewX(6deg)' : 'skewX(0deg)',
          transformOrigin: 'bottom center',
          transition: 'all 0.5s ease-out, background-color 0.8s ease-in-out',
        }}
      >
        {/* Eyes */}
        <div 
          className="absolute flex gap-5 transition-all duration-500"
          style={{
            left: shouldLookUp ? '34px' : '36px',
            top: shouldLookUp ? '18px' : '24px',
          }}
        >
          <EyeBall 
            size={14} 
            pupilSize={6} 
            maxDistance={4} 
            eyeColor="white" 
            pupilColor="#2D2D2D" 
            isBlinking={isPurpleBlinking}
          />
          <EyeBall 
            size={14} 
            pupilSize={6} 
            maxDistance={4} 
            eyeColor="white" 
            pupilColor="#2D2D2D" 
            isBlinking={isPurpleBlinking}
          />
        </div>
      </div>

      {/* Pink character - Second from left (medium-tall and narrow) */}
      <div 
        className="absolute bottom-0 ease-out"
        style={{
          left: '75px',
          width: '60px',
          height: shouldLookAtEachOther ? '155px' : '150px',
          backgroundColor: shouldLookAway ? '#ffc4d6' : '#ffb3cc',
          borderRadius: '8px 8px 0 0',
          zIndex: 3,
          transform: shouldLookAway ? 'skewX(-4deg)' : shouldLookAtEachOther ? 'skewX(4deg)' : 'skewX(0deg)',
          transformOrigin: 'bottom center',
          transition: 'all 0.5s ease-out, background-color 0.8s ease-in-out',
        }}
      >
        {/* Eyes */}
        <div 
          className="absolute flex gap-3 transition-all duration-500"
          style={{
            left: shouldLookUp ? '16px' : '14px',
            top: shouldLookUp ? '20px' : '26px',
          }}
        >
          <EyeBall 
            size={12} 
            pupilSize={5} 
            maxDistance={3} 
            eyeColor="white" 
            pupilColor="#2D2D2D" 
            isBlinking={isBlueBlinking}
          />
          <EyeBall 
            size={12} 
            pupilSize={5} 
            maxDistance={3} 
            eyeColor="white" 
            pupilColor="#2D2D2D" 
            isBlinking={isBlueBlinking}
          />
        </div>
      </div>

      {/* Lavender character - Third (shortest and widest) */}
      <div 
        className="absolute bottom-0 ease-out"
        style={{
          left: '110px',
          width: '150px',
          height: shouldLookAtEachOther ? '115px' : '110px',
          zIndex: 1,
          backgroundColor: shouldLookAway ? '#e5dfff' : '#d4d0fc',
          borderRadius: '75px 75px 0 0',
          transform: shouldLookAway ? 'skewX(0deg)' : shouldLookAtEachOther ? 'skewX(-2deg)' : 'skewX(0deg)',
          transformOrigin: 'bottom center',
          transition: 'all 0.5s ease-out, background-color 0.8s ease-in-out',
        }}
      >
        {/* Eyes */}
        <div 
          className="absolute flex gap-6 transition-all duration-500"
          style={{
            left: shouldLookUp ? '50px' : '54px',
            top: shouldLookUp ? '40px' : '46px',
          }}
        >
          <Pupil size={10} maxDistance={4} pupilColor="#2D2D2D" />
          <Pupil size={10} maxDistance={4} pupilColor="#2D2D2D" />
        </div>
      </div>

      {/* Blue character - Right (medium height and width) */}
      <div 
        className="absolute bottom-0 ease-out"
        style={{
          left: '230px',
          width: '90px',
          height: shouldLookAtEachOther ? '140px' : '135px',
          backgroundColor: shouldLookAway ? '#c4e0ff' : '#a8d4ff',
          borderRadius: '45px 45px 0 0',
          zIndex: 4,
          transform: shouldLookAway ? 'skewX(6deg)' : shouldLookAtEachOther ? 'skewX(-4deg)' : 'skewX(0deg)',
          transformOrigin: 'bottom center',
          transition: 'all 0.5s ease-out, background-color 0.8s ease-in-out',
        }}
      >
        {/* Eyes */}
        <div 
          className="absolute flex gap-4 transition-all duration-500"
          style={{
            left: shouldLookUp ? '28px' : '30px',
            top: shouldLookUp ? '22px' : '28px',
          }}
        >
          <Pupil size={10} maxDistance={4} pupilColor="#2D2D2D" />
          <Pupil size={10} maxDistance={4} pupilColor="#2D2D2D" />
        </div>
        
        {/* Mouth */}
        <div 
          className="absolute w-12 h-[3px] bg-[#2D2D2D] rounded-full transition-all duration-500"
          style={{
            left: shouldLookUp ? '24px' : '26px',
            top: shouldLookUp ? '62px' : '68px',
          }}
        />
      </div>
    </div>
  );
}

