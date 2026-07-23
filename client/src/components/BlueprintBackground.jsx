import React, { useEffect, useRef } from 'react';

const BlueprintBackground = () => {
    const svgRef = useRef(null);

    useEffect(() => {
        function adjustMapViewBox() {
            const svg = svgRef.current;
            if (!svg) return;
            if (window.innerWidth <= 768) {
                svg.setAttribute('viewBox', '220 0 1200 800');
            } else {
                svg.setAttribute('viewBox', '0 0 1200 800');
            }
        }
        adjustMapViewBox();
        window.addEventListener('resize', adjustMapViewBox);
        return () => window.removeEventListener('resize', adjustMapViewBox);
    }, []);

    return (
        <div className="bg-canvas">
            <svg ref={svgRef} className="bg-contours" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" fill="none">
                {/* Full SVG from original file */}
                <g fill="#0A4b9c" opacity="0.18">
                    <path d="M860,90 C 900,80 935,110 940,160 C 955,205 935,255 950,300 C 965,340 945,380 910,395 C 880,410 850,395 845,360 C 838,310 858,265 845,225 C 832,180 838,130 860,90 Z" />
                    <ellipse cx="905" cy="445" rx="32" ry="14" />
                    <ellipse cx="955" cy="465" rx="26" ry="12" transform="rotate(-12 955 465)" />
                    <ellipse cx="870" cy="485" rx="24" ry="11" transform="rotate(8 870 485)" />
                    <ellipse cx="935" cy="500" rx="22" ry="10" />
                    <path d="M895,560 C 945,545 985,565 990,605 C 998,640 970,675 930,680 C 890,685 860,665 858,630 C 856,595 870,575 895,560 Z" />
                    <path d="M785,340 C 800,335 808,355 802,380 C 798,410 778,440 762,455 C 750,463 742,453 748,438 C 758,408 770,365 785,340 Z" />
                </g>

                <g stroke="#0A4b9c" strokeWidth="1" strokeDasharray="3 5" fill="none" opacity="0.6" style={{ animation: 'dashMarquee 3s linear infinite' }}>
                    <path d="M895,260 Q 850,360 905,445" />
                    <path d="M905,445 Q 920,500 920,610" />
                    <path d="M905,445 Q 820,420 780,400" />
                    <path d="M895,260 Q 700,300 480,360" />
                    <path d="M920,610 Q 600,650 320,620" />
                </g>

                <g opacity="0.85">
                    <g style={{ animation: 'pinDrop1 5s ease-in-out infinite' }}>
                        <path d="M0,-14 C 7,-14 12,-9 12,-2 C 12,7 0,18 0,18 C 0,18 -12,7 -12,-2 C -12,-9 -7,-14 0,-14 Z" fill="#E12B3C" />
                        <circle cx="0" cy="-3" r="3.5" fill="#fff" />
                    </g>
                    <g style={{ animation: 'pinDrop2 6s ease-in-out infinite' }}>
                        <path d="M0,-12 C 6,-12 10,-8 10,-2 C 10,6 0,15 0,15 C 0,15 -10,6 -10,-2 C -10,-8 -6,-12 0,-12 Z" fill="#E12B3C" />
                        <circle cx="0" cy="-3" r="3" fill="#fff" />
                    </g>
                    <g style={{ animation: 'pinDrop3 7s ease-in-out infinite' }}>
                        <path d="M0,-12 C 6,-12 10,-8 10,-2 C 10,6 0,15 0,15 C 0,15 -10,6 -10,-2 C -10,-8 -6,-12 0,-12 Z" fill="#E12B3C" />
                        <circle cx="0" cy="-3" r="3" fill="#fff" />
                    </g>
                    <g transform="translate(780,398)">
                        <path d="M0,-10 C 5,-10 8,-7 8,-2 C 8,5 0,12 0,12 C 0,12 -8,5 -8,-2 C -8,-7 -5,-10 0,-10 Z" fill="#0A4b9c" />
                        <circle cx="0" cy="-3" r="2.5" fill="#fff" />
                    </g>
                    <g transform="translate(480,360)">
                        <path d="M0,-10 C 5,-10 8,-7 8,-2 C 8,5 0,12 0,12 C 0,12 -8,5 -8,-2 C -8,-7 -5,-10 0,-10 Z" fill="#0A4b9c" />
                        <circle cx="0" cy="-3" r="2.5" fill="#fff" />
                    </g>
                    <g transform="translate(320,620)">
                        <path d="M0,-10 C 5,-10 8,-7 8,-2 C 8,5 0,12 0,12 C 0,12 -8,5 -8,-2 C -8,-7 -5,-10 0,-10 Z" fill="#0A4b9c" />
                        <circle cx="0" cy="-3" r="2.5" fill="#fff" />
                    </g>
                </g>

                <g stroke="#0A4b9c" fill="none">
                    <circle cx="890" cy="250" r="24" strokeWidth="1.2" opacity="0.25">
                        <animate attributeName="r" values="24;32;24" dur="4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.25;0.05;0.25" dur="4s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="890" cy="250" r="42" strokeWidth="1" strokeDasharray="2 4" opacity="0.18">
                        <animate attributeName="r" values="42;52;42" dur="4s" begin="0.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.18;0.04;0.18" dur="4s" begin="0.8s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="890" cy="250" r="62" strokeWidth="0.8" strokeDasharray="2 6" opacity="0.12">
                        <animate attributeName="r" values="62;74;62" dur="4s" begin="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.12;0.02;0.12" dur="4s" begin="1.6s" repeatCount="indefinite" />
                    </circle>
                </g>

                <ellipse cx="900" cy="420" rx="340" ry="360" fill="rgba(100,190,240,0.22)" />
                <path d="M560,200 Q820,150 1060,220 Q1100,400 1060,650 Q820,720 600,680 Q500,600 520,400 Z" fill="rgba(120,200,245,0.18)" />
                <path opacity="0.28" fill="#64C8F0">
                    <animate attributeName="d"
                        values="M0,720 Q200,700 400,720 Q600,740 800,720 Q1000,700 1200,720 L1200,800 L0,800 Z;
                                M0,730 Q200,710 400,730 Q600,750 800,730 Q1000,710 1200,730 L1200,800 L0,800 Z;
                                M0,720 Q200,700 400,720 Q600,740 800,720 Q1000,700 1200,720 L1200,800 L0,800 Z"
                        dur="6s" repeatCount="indefinite" />
                </path>
                <path opacity="0.18" fill="#3ab4e8">
                    <animate attributeName="d"
                        values="M0,740 Q300,720 600,740 Q900,760 1200,740 L1200,800 L0,800 Z;
                                M0,750 Q300,730 600,750 Q900,770 1200,750 L1200,800 L0,800 Z;
                                M0,740 Q300,720 600,740 Q900,760 1200,740 L1200,800 L0,800 Z"
                        dur="8s" begin="1s" repeatCount="indefinite" />
                </path>

                <g opacity="0.55" style={{ animation: 'cardFloat1 7s ease-in-out infinite' }}>
                    <rect x="0" y="0" width="170" height="104" rx="8" fill="#fff" stroke="#0A4b9c" strokeWidth="1.2" />
                    <text x="12" y="22" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="700" fill="#0A4b9c" letterSpacing="0.8">STRIDE • ENROLLMENT</text>
                </g>
                <g opacity="0.55" style={{ animation: 'cardFloat2 9s ease-in-out infinite' }}>
                    <rect x="0" y="0" width="200" height="110" rx="8" fill="#fff" stroke="#0A4b9c" strokeWidth="1.2" />
                </g>
                <g opacity="0.55" style={{ animation: 'cardFloat3 8s ease-in-out infinite', animationDelay: '1s' }}>
                    <rect x="0" y="0" width="90" height="170" rx="12" fill="#fff" stroke="#0A4b9c" strokeWidth="1.4" />
                </g>
                <g opacity="0.55" style={{ animation: 'cloudFloat 10s ease-in-out infinite' }}>
                    <path d="M10,30 C 4,30 0,26 0,20 C 0,14 5,10 12,10 C 14,4 22,0 30,2 C 38,4 42,12 42,18 C 50,18 56,22 56,28 C 56,34 50,38 42,38 L12,38 C 6,38 0,34 10,30 Z" fill="#fff" stroke="#0A4b9c" strokeWidth="1.4" />
                </g>
                <g opacity="0.50" style={{ animation: 'photoFloat 11s ease-in-out infinite' }}>
                    <rect x="0" y="0" width="110" height="78" rx="6" fill="#fff" stroke="#0A4b9c" strokeWidth="1.2" />
                </g>
                <g fontFamily="'Sora', sans-serif" fontSize="8" fill="#0A4b9c" opacity="0.7" letterSpacing="1">
                    <text x="880" y="82">14.5995° N</text>
                    <text x="885" y="720">120.9842° E</text>
                    <text x="42" y="82">SECTOR 01</text>
                    <text x="42" y="720">FIELD SYNC • ONLINE</text>
                </g>
            </svg>
            <div className="bg-ribbon" />
            <div className="bg-yellow-glow" />
            <div className="bg-crosshair tl" />
            <div className="bg-crosshair tr" />
            <div className="bg-crosshair bl" />
            <div className="bg-crosshair br" />
        </div>
    );
};

export default BlueprintBackground;
