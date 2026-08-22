import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const MASTER_SUBJECTS_CATALOG = {
  Elementary: {
    Kinder: [
      'KINDER BLOCKS OF TIME'
    ],
    'Grade 1': [
      'LANGUAGE', 'READING AND LITERACY', 'MAKABANSA', 'MATHEMATICS', 'GMRC',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
      'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE',
      'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
    ],
    'Grade 2': [
      'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'GMRC',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
      'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE',
      'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
    ],
    'Grade 3': [
      'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
      'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE',
      'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
    ],
    'Grade 4': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION'
    ],
    'Grade 5': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION'
    ],
    'Grade 6': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION'
    ]
  },
  'Junior High School': {
    'All': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'VALUES EDUCATION', 'GMRC',
      'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
      'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
      'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
      'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
      'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING',
      'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
    ]
  },
  'Senior High School': {
    'SHS': [
      'GMRC', 'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
      'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
      'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
      'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
      'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING',
      'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'SHS-CORE SUBJECTS': [
      'ORAL COMMUNICATION', 'READING AND WRITING',
      'KOMUNIKASYON AT PANANALIKSIK SA WIKA AT KULTURANG PILIPINO',
      'PAGBASA AT PAGSUSURI NG IBA\'T-IBANG TEKSTO TUNGO SA PANANALIKSIK',
      '21ST CENTURY LITERATURE FROM THE PHILIPPINES AND THE WORLD',
      'CONTEMPORARY PHILIPPINE ARTS FROM THE REGIONS',
      'INTRODUCTION TO THE PHILOSOPHY OF THE HUMAN PERSON / PAMBUNGAD SA PILOSOPIYA NG TAO',
      'UNDERSTANDING CULTURE, SOCIETY AND POLITICS', 'MEDIA AND INFORMATION LITERACY',
      'GENERAL MATHEMATICS', 'STATISTICS AND PROBABILITY', 'PHYSICAL SCIENCE',
      'EARTH AND LIFE SCIENCE', 'PERSONAL DEVELOPMENT / PANSARILING KAUNLARAN',
      'PE AND HEALTH', 'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
    ],
    'SHS-APPLIED SUBJECTS': [
      'ENGLISH FOR ACADEMIC AND PROFESSIONAL PURPOSES', 'ENTREPRENEURSHIP',
      'PRACTICAL RESEARCH 1', 'EMPOWERMENT TECHNOLOGIES (E-TECH): ICT FPR PROFESSIONAL TRACKS',
      'PAGSULAT SA FILIPINO SA PILING LARANGAN (AKADEMIK)',
      'PAGSULAT SA FILIPINO SA PILING LARANGAN (TECH-VOC)',
      'PAGSULAT SA FILIPINO SA PILING LARANGAN (ISPORTS)',
      'PAGSULAT SA FILIPINO SA PILING LARANGAN (SINING)',
      'PRACTICAL RESEARCH 2', 'RESEARCH PROJECT/CULMINATING ACTIVITY*'
    ],
    'SSHS-CORE': [
      'EFFECTIVE COMMUNICATION', 'MABISANG KOMUNIKASYON', 'GENERAL MATHEMATICS',
      'GENERAL SCIENCE', 'LIFE AND CAREER SKILLS', 'PAG-AARAL NG KASAYSAYAN AT LIPUNANG PILIPINO'
    ],
    'SSHS-ACADEMIC': [
      'ARTS 1 (CREATIVE INDUSTRIES - VISUAL ART, LITERARY ART, MEDIA ART, APPLIED ART, AND TRADITIONAL ART)',
      'ARTS 2 (CREATIVE INDUSTRIES - MUSIC, DANCE, AND THEATER)',
      'FILIPINO IDENTITY THROUGH THE ARTS', 'LEADERSHIP AND MANGEMENT IN THE ARTS',
      'CITIZENSHIP AND CIVIC ENGAGEMENT', 'CONTEMPORARY LITERATURE 1', 'CONTEMPORARY LITERATURE 2',
      'CREATIVE COMPOSITION 1', 'CREATIVE COMPOSITION 2',
      'FILIPINO 1 (WIKA AT KOMUNIKASYON SA AKADEMIKONG FILIPINO)',
      'FILIPINO 2 (FILIPINO PARA SA LARANG TEKNIKAL-PROPESYONAL)',
      'FILIPINO 2 (FILIPINO SA ISPORTS)', 'FILIPINO 2 (FILIPINO SA SINING AT DISENYO)',
      'INTRODUCTION TO PHILOSOPHY', 'MALIKHAING PAGSULAT',
      'PHILIPPINE GOVERNANCE (PHILIPPINE POLITICS AND GOVERNANCE)',
      'SOCIAL SCIENCES (THEORY AND PRACTICE)', 'BUSINESS 1 (BASIC ACCOUNTING)',
      'BUSINESS 2 (BUSINESS FINANCE AND INCOME TAXATION)', 'BUSINESS 3 (BUSINESS ECONOMICS)',
      'CONTEMPORARY MARKETING', 'INTRODUCTION TO ORGANIZATION AND MANAGEMENT',
      'ADVANCED MATHEMATICS 1', 'ADVANCED MATHEMATICS 2', 'BIOLOGY 1', 'BIOLOGY 2', 'BIOLOGY 3', 'BIOLOGY 4',
      'CHEMISTRY 1', 'CHEMISTRY 2', 'CHEMISTRY 3', 'CHEMISTRY 4', 'DATABASE MANAGEMENT',
      'EARTH AND SPACE SCIENCE 1', 'EARTH AND SPACE SCIENCE 2', 'EARTH AND SPACE SCIENCE 3', 'EARTH AND SPACE SCIENCE 4',
      'FINITE MATHEMATICS 1', 'FINITE MATHEMATICS 2', 'FUNDAMENTALS IN DATA ANALYTICS',
      'GENERAL SCIENCE 3', 'GENERAL SCIENCE 4', 'PHYSICS 1', 'PHYSICS 2', 'PHYSICS 3', 'PHYSICS 4',
      'PRE-CALCULUS 1', 'PRE-CALCULUS 2', 'TRIGONOMETRY 1', 'TRIGONOMETRY 2',
      'EXERCISE AND SPORTS PROGRAMMING', 'HUMAN MOVEMENT 1 (BASIC ANATOMY IN SPORTS AND EXERCISE)',
      'HUMAN MOVEMENT 2 (MOTOR SKILLS DEVELOPMENT)', 'PHYSICAL EDUCATION 1 (FITNESS AND RECREATION)',
      'PHYSICAL EDUCATION 2 (SPORTS AND DANCE)', 'SPORTS ACTIVITY MANAGEMENT',
      'SPORTS COACHING', 'SPORTS OFFICIATING',
      'ARTS APPRENTICESHIP (DANCE, MUSIC, THEATER ARTS, LITERARY ARTS, VISUAL ARTS, VISUAL, MEDIA, APPLIED, AND TRADITIONAL ART)',
      'CREATIVE PRODUCTION AND PRESENTATION', 'DESIGN AND INNOVATION', 'RESEARCH METHODS',
      '(IN-CAMPUS) SPORTS', '(OFF-CAMPUS) (BUSINESS AND ENTREPRENEURSHIP/ SPORTS HEALTH, AND WELLNESS/ SCIENCE, TECHNOLOGY, ENGINEERING, AND MATHEMATICS)',
      'ELECTIVES, SPECIAL CURRICULAR PROGRAMS, OR INSTITUTIONAL'
    ],
    'SSHS-TECHPRO': [
      'AESTHETIC SERVICES (BEAUTY CARE)', 'BARBERING SERVICES', 'CAREGIVING (ADULT CARE)',
      'CAREGIVING (CHILD CARE)', 'HAIRDRESSING SERVICES', 'WELLNESS SERVICES (HILOT/MASSAGE)',
      'AGRICULTURAL CROPS PRODUCTION', 'AGRO-ENTREPRENEURSHIP', 'AQUACULTURE',
      'FISH CAPTURE OPERATION', 'FOOD PROCESSING', 'ORGANIC AGRICULTURE PRODUCTION',
      'POULTRY PRODUCTION (CHICKEN)', 'RUMINANTS PRODUCTION', 'SWINE PRODUCTION',
      'GARMENTS ARTISANRY', 'HANDICRAFTS (WEAVING)', 'AUTOMOTIVE SERVICING (ELECTRICAL REPAIR)',
      'AUTOMOTIVE SERVICING (ENGINE AND CHASSIS REPAIRS)', 'DRIVING AND AUTOMOTIVE SERVICING',
      'MOTORCYCLE AND SMALL ENGINE SERVICING', 'CARPENTRY', 'CONSTRUCTION OPERATION',
      'MANUAL METAL ARC WELDING', 'TECHNICAL DRAFTING', 'ANIMATION', 'ILLUSTRATION',
      'VISUAL GRAPHICS DESIGN', 'BAKERY OPERATION', 'EVENTS MANAGEMENT SERVICES',
      'FOOD AND BEVERAGE OPERATION', 'HOTEL OPERATION (FRONT OFFICE SERVICES)',
      'HOTEL OPERATION (HOUSEKEEPING SERVICES)', 'KITCHEN OPERATIONS', 'TOURISM SERVICES',
      'COMMERCIAL AIR-CONDITIONING INSTALLATION AND SERVICING',
      'DOMESTIC REFRIGERATION AND AIR-CONDITIONING SERVICING',
      'ELECTRICAL INSTALLATION MAINTENANCE', 'ELECTRONICS PRODUCT ASSEMBLY AND SERVICING',
      'MECHATRONICS', 'PHOTOVOLTAIC SYSTEMS INSTALLATION', 'BROADBAND INSTALLATION',
      'COMPUTER PROGRAMMING (JAVA)', 'COMPUTER PROGRAMMING (.NET TECHNOLOGY)',
      'COMPUTER PROGRAMMING (ORACLE DATABASE)', 'COMPUTER SYSTEMS SERVICING',
      'CONTACT CENTER SERVICES', 'MARINE ENGINEERING AT THE SUPPORT LEVEL',
      'MARINE TRANSPORTATION AT THE SUPPORT LEVEL', 'SHIPS CATERING SERVICES',
      'WORK IMMERSION - AESTHETIC, WELLNESS AND HUMAN CARE CLUSTER',
      'WORK IMMERSION - AGRI-FISHERY BUSINESS AND FOOD INNOVATION',
      'WORK IMMERSION - ARTISANRY AND CREATIVE ENTERPRISE',
      'WORK IMMERSION - AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES',
      'WORK IMMERSION - CONSTRUCTION AND BUILDING TECHNOLOGIES',
      'WORK IMMERSION - CREATIVE ARTS AND DESIGN TECHNOLOGIES',
      'WORK IMMERSION - HOSPITALITY AND TOURISM', 'WORK IMMERSION - INDUSTRIAL TECHNOLOGIES',
      'WORK IMMERSION - ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES',
      'WORK IMMERSION - MARITIME TRANSPORT'
    ],
    'SHS-SPECIALIZED SUBJECTS': [
      'BASIC CALCULUS', 'GENERAL BIOLOGY 1', 'GENERAL BIOLOGY 2', 'GENERAL CHEMISTRY 1',
      'GENERAL CHEMISTRY 2', 'GENERAL PHYSICS 1', 'GENERAL PHYSICS 2', 'PRE-CALCULUS',
      'APPLIED ECONOMICS', 'BUSINESS ETHICS AND SOCIAL RESPONSIBILITY',
      'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 1',
      'FUNDAMENTALS OF ACCOUNTANCY, BUSINESS, AND MANAGEMENT 2', 'BUSINESS MATH',
      'BUSINESS FINANCE', 'ORGANIZATION AND MANAGEMENT', 'PRINCIPLES OF MARKETING',
      'CREATIVE NONFICTION', 'CREATIVE WRITING/MALIKHAING PAGSULAT',
      'INTRODUCTION TO WORLD RELIGIONS AND BELIEF SYSTEMS',
      'TRENDS, NETWORKS, AND CRITICAL THINKING IN THE 21ST CENTURY CULTURE',
      'COMMUNITY ENGAGEMENT, SOLIDARITY, AND CITIZENSHIP',
      'DISCIPLINE AND IDEAS IN THE APPLIED SCIENCES',
      'DISCIPLINES AND IDEAS IN THE SOCIAL SCIENCES', 'PHILIPPINE POLITICS AND GOVERNANCE',
      'DISASTER READINESS AND RISK REDUCTION (GAS)',
      'APPRENTICESHIP AND EXPLORATION OF DIFFERENT ARTS FIELDS',
      'CREATIVE INDUSTRIES I: ARTS AND DESIGN APPRECIATION AND PRODUCTION',
      'CREATIVE INDUSTRIES II: PERFORMING ARTS', 'DEVELOPING FILIPINO IDENTITY IN THE ARTS',
      '(ARTS)EXHIBIT FOR ARTS PRODUCTION (LITERARY ARTS)',
      'EXHIBIT FOR ARTS PRODUCTION (MEDIA ARTS AND VISUAL ARTS)',
      'INTEGRATING THE ELEMENTS AND PRINCIPLES OF ORGANIZATION IN THE ARTS',
      'LEADERSHIP AND MANAGEMENT IN DIFFERENT ARTS FIELDS', 'PERFORMING ARTS PRODUCTION',
      'PHYSICAL AND PERSONAL DEVELOPMENT IN THE ARTS', 'APPRENTICESHIP (OFF-CAMPUS)',
      'FITNESS TESTING AND EXERCISE PROGRAMMING', 'FITNESS, SPORTS, AND RECREATION LEADERSHIP',
      'FUNDAMENTAL OF COACHING', 'HUMAN MOVEMENT', 'PRACTICUM (IN-CAMPUS)',
      'PSYCHOSOCIAL ASPECTS OF SPORTS AND EXERCISE', 'SAFETY AND FIRST AID',
      'SPORTS OFFICIATING AND ACTIVITY MANAGEMENT', 'AGRICULTURAL CROP PRODUCTION (NC I)',
      'AGRICULTURAL CROP PRODUCTION (NC II)', 'AGRICULTURAL CROP PRODUCTION (NC III)',
      'ANIMAL HEALTH CARE MANAGEMENT (NC III)', 'ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)',
      'ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)', 'ANIMAL PRODUCTION- SWINE (NC II)',
      'AQUACULTURE (NC II)', 'ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)',
      'ARTIFICIAL INSEMINATION- SWINE (NC II)', 'FISH CAPTURE (NC II)',
      'FISH PRODUCTS PACKAGING (NC II)', 'FISH WHARF OPERATION (NC I)',
      'FISHING GEAR REPAIR AND MAINTENANCE (NC III)', 'FOOD PROCESSING (NC II)',
      'HORTICULTURE (NC III)', 'LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)',
      'ORGANIC AGRICULTURE PRODUCTION (NC II)', 'PEST MANAGEMENT (NC II)',
      'RICE MACHINERY OPERATION (NC II)', 'RUBBER PROCESSING (NC II)',
      'RUBBER PRODUCTION (NC I)', 'SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)',
      'ATTRACTIONS AND THEME PARKS TOURISM (NC II)', 'BARBERING (NC II)', 'BARTENDING (NC II)',
      'BEAUTY/ NAIL CARE (NC II)', 'BREAD AND PASTRY PRODUCTION (NC II)', 'CAREGIVING (NC II)',
      'COMMERCIAL COOKING (NC III)', 'COOKERY (NC II)', 'DRESSMAKING (NC II)',
      'EVENTS MANAGEMENT SERVICES (NC III)', 'FASHION DESIGN (NC III)',
      'FOOD AND BEVERAGE SERVICES (NC II)', 'FRONT OFFICE SERVICES (NC II)',
      'HAIRDRESSING (NC II)', 'HAIRDRESSING (NC III)',
      'HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT', 'HANDICRAFT- NEEDLECRAFT',
      'HANDICRAFT- WOODCRAFT LEATHERCRAFT', 'HANDICRAFT- BASKETRY MACRAME',
      'HOUSEKEEPING (NC II)', 'TAILORING (NC II)', 'LOCAL GUIDING SERVICES (NC II)',
      'TOURISM PROMOTION SERVICES (NC II)', 'TRAVEL SERVICES (NC II)',
      'WELLNESS MASSAGE (NC II)', 'ANIMATION (NC II)',
      'BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
      'COMPUTER SYSTEMS SERVICING (NC II)', 'COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
      'COMPUTER PROGRAMMING JAVA (NC III)', 'COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
      'CONTACT CENTER SERVICES (NC II)', 'ILLUSTRATION (NC II)',
      'MEDICAL TRANSCRIPTION (NC II)', 'TECHNICAL DRAFTING (NC II)',
      'TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
      'TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)', 'AUTOMOTIVE SERVICING (NC I)',
      'AUTOMOTIVE SERVICING (NC II)', 'CARPENTRY (NC II)', 'CARPENTRY (NC III)',
      'CONSTRUCTION PAINTING (NC II)', 'ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
      'DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
      'DRIVING (NC II)', 'ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
      'ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)', 'FURNITURE MAKING- FINISHING (NC II)',
      'GAS METAL ARC WELDING- GMAW (NC II)', 'GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
      'INSTRUMENTATION AND CONTROL SERVICING (NC II)', 'MACHINING (NC I)',
      'MACHINING (NC II)', 'MASONRY (NC II)', 'MECHATRONICS SERVICING (NC II)',
      'MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)', 'PLUMBING (NC I)', 'PLUMBING (NC II)',
      'REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
      'SHIELDED METAL ARC WELDING (NC I)', 'SHIELDED METAL ARC WELDING (NC II)',
      'TILE SETTING (NC II)', 'TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
      'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (160)',
      '(GAS) AGRICULTURAL CROP PRODUCTION (NC I)', '(GAS) AGRICULTURAL CROP PRODUCTION (NC II)',
      '(GAS) AGRICULTURAL CROP PRODUCTION (NC III)', '(GAS) ANIMAL HEALTH CARE MANAGEMENT (NC III)',
      '(GAS) ANIMAL PRODUCTION- POULTRY CHICKEN (NC II)', '(GAS) ANIMAL PRODUCTION- LARGE RUMINANTS (NC II)',
      '(GAS) ANIMAL PRODUCTION- SWINE (NC II)', '(GAS) AQUACULTURE (NC II)',
      '(GAS) ARTIFICIAL INSEMINATION- LARGE RUMINANTS (NC II)', '(GAS) ARTIFICIAL INSEMINATION- SWINE (NC II)',
      '(GAS) FISH CAPTURE (NC II)', '(GAS) FISH PRODUCTS PACKAGING (NC II)',
      '(GAS) FISH WHARF OPERATION (NC I)', '(GAS) FISHING GEAR REPAIR AND MAINTENANCE (NC III)',
      '(GAS) FOOD PROCESSING (NC II)', '(GAS) HORTICULTURE (NC III)',
      '(GAS) LANDSCAPE INSTALLATION AND MAINTENANCE (NC II)', '(GAS) ORGANIC AGRICULTURE PRODUCTION (NC II)',
      '(GAS) PEST MANAGEMENT (NC II)', '(GAS) RICE MACHINERY OPERATION (NC II)',
      '(GAS) RUBBER PROCESSING (NC II)', '(GAS) RUBBER PRODUCTION (NC I)',
      '(GAS) SLAUGHTERING OPERATION- HOG SWINE PIG (NC II)', '(GAS) ATTRACTIONS AND THEME PARKS TOURISM (NC II)',
      '(GAS) BARBERING (NC II)', '(GAS) BARTENDING (NC II)', '(GAS) BEAUTY/ NAIL CARE (NC II)',
      '(GAS) BREAD AND PASTRY PRODUCTION (NC II)', '(GAS) CAREGIVING (NC II)',
      '(GAS) COMMERCIAL COOKING (NC III)', '(GAS) COOKERY (NC II)', '(GAS) DRESSMAKING (NC II)',
      '(GAS) EVENTS MANAGEMENT SERVICES (NC III)', '(GAS) FASHION DESIGN (NC III)',
      '(GAS) FOOD AND BEVERAGE SERVICES (NC II)', '(GAS) FRONT OFFICE SERVICES (NC II)',
      '(GAS) HAIRDRESSING (NC II)', '(GAS) HAIRDRESSING (NC III)',
      '(GAS) HANDICRAFT- FASHION ACCESSORIES  AND PAPER CRAFT', '(GAS) HANDICRAFT- NEEDLECRAFT',
      '(GAS) HANDICRAFT- WOODCRAFT LEATHERCRAFT', '(GAS) HANDICRAFT- BASKETRY MACRAME',
      '(GAS) HOUSEKEEPING (NC II)', '(GAS) TAILORING (NC II)', '(GAS) LOCAL GUIDING SERVICES (NC II)',
      '(GAS) TOURISM PROMOTION SERVICES (NC II)', '(GAS) TRAVEL SERVICES (NC II)',
      '(GAS) WELLNESS MASSAGE (NC II)', '(GAS) ANIMATION (NC II)',
      '(GAS) BROADBAND INSTALLATION- FIXED WIRELESS SYSTEMS (NC II)',
      '(GAS) COMPUTER SYSTEMS SERVICING (NC II)', '(GAS) COMPUTER PROGRAMMING .NET TECHNOLOGY (NC III)',
      '(GAS) COMPUTER PROGRAMMING JAVA (NC III)', '(GAS) COMPUTER PROGRAMMING ORACLE DATABASE (NC III)',
      '(GAS) CONTACT CENTER SERVICES (NC II)', '(GAS) ILLUSTRATION (NC II)',
      '(GAS) MEDICAL TRANSCRIPTION (NC II)', '(GAS) TECHNICAL DRAFTING (NC II)',
      '(GAS) TELECOM OSP AND SUBSCRIBER LINE INSTALLATION- COPPER CABLE/ POTS AND DSL (NC II)',
      '(GAS) TELECOM OSP INSTALLATION- FIBER OPTIC CABLE (NC II)', '(GAS) AUTOMOTIVE SERVICING (NC I)',
      '(GAS) AUTOMOTIVE SERVICING (NC II)', '(GAS) CARPENTRY (NC II)', '(GAS) CARPENTRY (NC III)',
      '(GAS) CONSTRUCTION PAINTING (NC II)', '(GAS) ELECTRONIC PRODUCTS ASSEMBLY AND SERVICING (NC II)',
      '(GAS) DOMESTIC REFRIGERATION AND AIR-CONDITIONING (DOMRAC) SERVICING (NC II)',
      '(GAS) DRIVING (NC II)', '(GAS) ELECTRIC POWER DISTRIBUTION LINE CONSTRUCTION (NC II)',
      '(GAS) ELECTRICAL INSTALLATION AND MAINTENANCE (NC II)', '(GAS) FURNITURE MAKING- FINISHING (NC II)',
      '(GAS) GAS METAL ARC WELDING- GMAW (NC II)', '(GAS) GAS TUNGSTEN ARC WELDING- GTAW (NC II)',
      '(GAS) INSTRUMENTATION AND CONTROL SERVICING (NC II)', '(GAS) MACHINING (NC I)',
      '(GAS) MACHINING (NC II)', '(GAS) MASONRY (NC II)', '(GAS) MECHATRONICS SERVICING (NC II)',
      '(GAS) MOTORCYCLE/ SMALL ENGINE SERVICING (NC II)', '(GAS) PLUMBING (NC I)', '(GAS) PLUMBING (NC II)',
      '(GAS) REFRIGERATION AND AIR-CONDITIONING [RAC] PACKED AIR-CONDITIONING UNIT [PACU] COMMERCIAL REFRIGERATION EQUIPMENT [CRE] SERVICING (NC II)',
      '(GAS) SHIELDED METAL ARC WELDING (NC I)', '(GAS) SHIELDED METAL ARC WELDING (NC II)',
      '(GAS) TILE SETTING (NC II)', '(GAS) TRANSMISSION LINE INSTALLATION AND MAINTENANCE (NC II)',
      'WORK IMMERSION/RESEARCH/CAREER ADVOCACY/CULMINATING ACTIVITY  (240)',
      'NAVIGATIONAL WATCH 1', 'NAVIGATIONAL WATCH 2', 'NAVIGATIONAL WATCH 3',
      'ENGINE WATCH 1', 'ENGINE WATCH 2', 'SAFETY 1', 'SAFETY 2',
      'SHIP\'S CATERING SERVICES 1', 'MARITIME (PB)', 'INTRODUCTION TO MARITIME CAREER',
      'INTRODUCTION TO MARINE TRANSPORTATION AND ENGINEERING', 'INTRODUCTION TO MARITIME SAFETY',
      'INQUIRIES, INVESTIGATIONS AND IMMERSION', 'RESEARCH/CAPSTONE PROJECT', 'OTHERS SPECIALIZED SUBJECT'
    ]
  }
};

const GRADE_SUBJECT_MAP = {
  Kinder: [
    'KINDER BLOCKS OF TIME'
  ],
  'Grade 1': [
    'LANGUAGE', 'READING AND LITERACY', 'MAKABANSA', 'MATHEMATICS', 'GMRC',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE',
    'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
  ],
  'Grade 2': [
    'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'GMRC',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE',
    'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
  ],
  'Grade 3': [
    'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE',
    'REMEDIATION', 'REMEDIAL/ENHANCEMENT CLASS'
  ],
  'Grade 4': [
    'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
    'EPP/TLE', 'EPP / TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION'
  ],
  'Grade 5': [
    'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
    'EPP/TLE', 'EPP / TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION'
  ],
  'Grade 6': [
    'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
    'EPP/TLE', 'EPP / TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE', 'REMEDIATION'
  ]
};

export const getSectionSizeStatus = (gradeLevel, totalLearners) => {
  const total = Number(totalLearners) || 0;
  const gradeStr = String(gradeLevel || '').toUpperCase().trim();

  // Kindergarten
  if (gradeStr.includes('KINDER')) {
    if (total < 15) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<15)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 25) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (15-25)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>25)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

  // Grades 1 to 3 (Key Stage 1)
  if (['GRADE 1', 'GRADE 2', 'GRADE 3', '1', '2', '3', 'G1', 'G2', 'G3'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 25) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<25)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 35) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (25-35)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>35)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

  // Grades 4 to 6 (Key Stage 2)
  if (['GRADE 4', 'GRADE 5', 'GRADE 6', '4', '5', '6', 'G4', 'G5', 'G6'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 30) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<30)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 45) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (30-45)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>45)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

  // Grades 7 to 10 (Junior High School / Key Stage 3)
  if (['GRADE 7', 'GRADE 8', 'GRADE 9', 'GRADE 10', '7', '8', '9', '10', 'G7', 'G8', 'G9', 'G10', 'JHS'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 35) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<35)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 45) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (35-45)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>45)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

  // Grades 11 to 12 (Senior High School / Key Stage 4)
  if (['GRADE 11', 'GRADE 12', '11', '12', 'G11', 'G12', 'SHS'].some(g => gradeStr === g || gradeStr.includes(g))) {
    if (total < 30) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<30)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 40) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (30-40)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>40)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

  // Default fallback (35-45)
  if (total < 35) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<35)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
  if (total <= 45) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (35-45)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
  return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>45)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
};

export default function OrganizedClasses() {
  const { classSections, addClassSection, updateSectionDetails, updateSectionAdviser, updateSectionLearners, removeClassSection, personnel, schoolInfo, saveSchoolSubjects, showAlert, showConfirm, completeNode, setActiveView } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMultigrade, setIsMultigrade] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'list'
  const [isAralModalOpen, setIsAralModalOpen] = useState(false);
  const [aralBasis, setAralBasis] = useState('grade');
  const [aralGrade, setAralGrade] = useState('Grade 3');
  const [aralToolKey, setAralToolKey] = useState('crla'); // 'crla', 'philIri', 'rma'
  const [aralProfileLevel, setAralProfileLevel] = useState('Emerging');
  const [aralLearners, setAralLearners] = useState(15);
  const [aralTutorId, setAralTutorId] = useState('');

  const ARAL_TOOLS = {
    crla: {
      domain: 'Reading',
      tool: 'CRLA',
      toolFull: 'Comprehensive Rapid Literacy Assessment (Grades 1-3)',
      levels: ['Emerging', 'Developing', 'Transitioning', 'Reading at Grade Level']
    },
    philIri: {
      domain: 'Reading',
      tool: 'Phil-IRI',
      toolFull: 'Philippine Informal Reading Inventory (Grades 4-10)',
      levels: ['Frustration', 'Instructional', 'Independent']
    },
    rma: {
      domain: 'Mathematics',
      tool: 'RMA',
      toolFull: 'Rapid Math Assessment (Grades 1-10)',
      levels: ['Not Proficient', 'Low Proficient', 'Nearly Proficient', 'Proficient', 'Highly Proficient']
    }
  };

  const activePersonnel = (Array.isArray(personnel) ? personnel : []).filter(p => !p.isDraft);

  const handleAralSubmit = (e) => {
    e.preventDefault();
    if (!aralTutorId) {
      if (showAlert) showAlert("Tutor Required", "Please select a section tutor for the ARAL section.");
      return;
    }
    let sectionType = 'ARAL_GRADE';
    let sectionName = `ARAL (Grade-Level) - ${aralGrade}`;
    let resGrade = aralGrade;

    if (aralBasis === 'assessment') {
      const toolObj = ARAL_TOOLS[aralToolKey] || ARAL_TOOLS.crla;
      const selectedLevel = toolObj.levels.includes(aralProfileLevel) ? aralProfileLevel : toolObj.levels[0];
      sectionType = `ARAL_${toolObj.tool}_${selectedLevel.toUpperCase().replace(/ /g, '_')}`;
      sectionName = `ARAL (${toolObj.tool} - ${selectedLevel})`;
      resGrade = 'ARAL';
    }

    addClassSection({
      gradeLevel: resGrade,
      sectionName,
      adviserId: aralTutorId,
      sectionType,
      numberOfLearners: Number(aralLearners) || 0
    });
    setIsAralModalOpen(false);
    setAralTutorId('');
  };

  const cleanSubjectConfig = (cfg) => {
    const isRestricted = (name) => {
      const u = String(name || '').toUpperCase().trim();
      return u === 'ADVISORY' || u === 'HGP' || u.includes('HOMEROOM GUIDANCE') || u === 'MOTHER TONGUE' || u.includes('MOTHER TONGUE');
    };

    const source = (cfg && typeof cfg === 'object') ? cfg : DEFAULT_SUBJECTS;
    const result = {};

    ['Elementary', 'Junior High School', 'Senior High School'].forEach(band => {
      const defaults = DEFAULT_SUBJECTS[band] || [];
      const userList = Array.isArray(source[band]) ? source[band] : defaults;
      
      const existingNames = new Set(userList.map(s => String(s.name || '').toUpperCase().trim()));

      const merged = userList
        .filter(s => !isRestricted(s.name))
        .map(s => {
          const uName = String(s.name || '').toUpperCase().trim();
          const defMatch = defaults.find(d => String(d.name || '').toUpperCase().trim() === uName);
          return {
            ...s,
            shsCategory: s.shsCategory || (defMatch ? defMatch.shsCategory : undefined),
            gradeLevel: s.gradeLevel || (defMatch ? defMatch.gradeLevel : undefined)
          };
        });

      const seen = new Set();
      const deduplicated = [];

      merged.forEach(item => {
        const uName = String(item.name || '').toUpperCase().trim();
        if (!seen.has(uName)) {
          seen.add(uName);
          deduplicated.push(item);
        }
      });

      result[band] = deduplicated;
    });

    return result;
  };

  // Subjects Taught Card state
  const [disabledSubjectsMap, setDisabledSubjectsMap] = useState(() => {
    try {
      const saved = schoolInfo?.subjectsConfig?.disabledMap || (localStorage.getItem('school_disabled_subjects') ? JSON.parse(localStorage.getItem('school_disabled_subjects')) : {});
      return saved || {};
    } catch (e) {
      return {};
    }
  });

  const [customSubjects, setCustomSubjects] = useState(() => {
    try {
      const saved = schoolInfo?.subjectsConfig?.customSubjects || (localStorage.getItem('school_custom_subjects') ? JSON.parse(localStorage.getItem('school_custom_subjects')) : []);
      return Array.isArray(saved) ? saved : [];
    } catch (e) {
      return [];
    }
  });

  // Edit Section Modal state
  const [editModalSection, setEditModalSection] = useState(null);
  const [editMale, setEditMale] = useState('');
  const [editFemale, setEditFemale] = useState('');
  const [editAdvisorId, setEditAdvisorId] = useState('');
  const [editSectionName, setEditSectionName] = useState('');
  const [editGradeLevel, setEditGradeLevel] = useState('');

  const openEditModal = (sec) => {
    setEditModalSection(sec);
    setEditSectionName(sec.sectionName || '');
    setEditGradeLevel(sec.gradeLevel || '');
    setEditMale(sec.maleLearners !== undefined && sec.maleLearners !== null ? String(sec.maleLearners) : '');
    setEditFemale(sec.femaleLearners !== undefined && sec.femaleLearners !== null ? String(sec.femaleLearners) : '');
    setEditAdvisorId(sec.advisorId || '');
  };

  const handleSaveEditSection = (e) => {
    if (e) e.preventDefault();
    if (!editModalSection) return;
    const rawM = editMale.slice(0, 2);
    const rawF = editFemale.slice(0, 2);
    const mVal = rawM === '' ? null : Math.min(99, Math.max(0, Number(rawM)));
    const fVal = rawF === '' ? null : Math.min(99, Math.max(0, Number(rawF)));
    const total = (mVal || 0) + (fVal || 0);

    updateSectionDetails(editModalSection.id, {
      sectionName: editSectionName,
      gradeLevel: editGradeLevel,
      maleLearners: mVal,
      femaleLearners: fVal,
      numberOfLearners: total,
      advisorId: editAdvisorId
    });
    setEditModalSection(null);
  };

  React.useEffect(() => {
    if (schoolInfo?.subjectsConfig) {
      if (schoolInfo.subjectsConfig.disabledMap) setDisabledSubjectsMap(schoolInfo.subjectsConfig.disabledMap);
      if (schoolInfo.subjectsConfig.customSubjects) setCustomSubjects(schoolInfo.subjectsConfig.customSubjects);
    }
  }, [schoolInfo?.subjectsConfig]);

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [selectedBand, setSelectedBand] = useState('Elementary');
  const [selectedShsCategory, setSelectedShsCategory] = useState('SHS-CORE SUBJECTS');
  const [selectedShsFilterCategory, setSelectedShsFilterCategory] = useState('All');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState('All');
  const [selectedModalGradeLevel, setSelectedModalGradeLevel] = useState('All');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');

  const getSubjectsForView = () => {
    let baseList = [];

    if (selectedBand === 'Elementary') {
      if (selectedGradeLevel === 'All') {
        const set = new Set();
        Object.values(MASTER_SUBJECTS_CATALOG.Elementary).forEach(arr => arr.forEach(s => set.add(s)));
        baseList = Array.from(set).map(name => ({ name }));
      } else {
        const arr = MASTER_SUBJECTS_CATALOG.Elementary[selectedGradeLevel] || [];
        baseList = arr.map(name => ({ name, gradeLevel: selectedGradeLevel }));
      }
    } else if (selectedBand === 'Junior High School') {
      baseList = MASTER_SUBJECTS_CATALOG['Junior High School']['All'].map(name => ({ name }));
    } else if (selectedBand === 'Senior High School') {
      if (selectedShsFilterCategory === 'All') {
        const list = [];
        Object.entries(MASTER_SUBJECTS_CATALOG['Senior High School']).forEach(([cat, arr]) => {
          arr.forEach(name => list.push({ name, shsCategory: cat }));
        });
        baseList = list;
      } else {
        const arr = MASTER_SUBJECTS_CATALOG['Senior High School'][selectedShsFilterCategory] || [];
        baseList = arr.map(name => ({ name, shsCategory: selectedShsFilterCategory }));
      }
    }

    // Merge any custom subjects added by user for this band & gradeLevel / category
    (customSubjects || []).forEach(cs => {
      if (cs.band === selectedBand) {
        if (selectedBand === 'Elementary' && selectedGradeLevel !== 'All' && cs.gradeLevel && cs.gradeLevel !== 'All' && cs.gradeLevel !== selectedGradeLevel) {
          return;
        }
        if (selectedBand === 'Senior High School' && selectedShsFilterCategory !== 'All' && cs.shsCategory && cs.shsCategory !== selectedShsFilterCategory) {
          return;
        }
        baseList.push(cs);
      }
    });

    // Remove restricted (ADVISORY, HGP, MOTHER TONGUE)
    baseList = baseList.filter(s => {
      const u = String(s.name || '').toUpperCase().trim();
      return u !== 'ADVISORY' && u !== 'HGP' && !u.includes('HOMEROOM GUIDANCE') && u !== 'MOTHER TONGUE' && !u.includes('MOTHER TONGUE');
    });

    // Filter by search query if present
    if (subjectSearchQuery.trim()) {
      const q = subjectSearchQuery.trim().toLowerCase();
      baseList = baseList.filter(s => String(s.name || '').toLowerCase().includes(q));
    }

    // Map enabled state
    return baseList.map(s => ({
      ...s,
      enabled: disabledSubjectsMap[s.name] !== true
    }));
  };

  const toggleSubject = (subjectName) => {
    const isCurrentlyDisabled = disabledSubjectsMap[subjectName] === true;
    const updatedMap = {
      ...disabledSubjectsMap,
      [subjectName]: !isCurrentlyDisabled
    };
    setDisabledSubjectsMap(updatedMap);
    localStorage.setItem('school_disabled_subjects', JSON.stringify(updatedMap));
    if (saveSchoolSubjects) {
      saveSchoolSubjects({ disabledMap: updatedMap, customSubjects });
    }
  };

  const handleCheckAll = () => {
    const currentSubjects = getSubjectsForView();
    const updatedMap = { ...disabledSubjectsMap };
    currentSubjects.forEach(s => {
      delete updatedMap[s.name];
    });
    setDisabledSubjectsMap(updatedMap);
    localStorage.setItem('school_disabled_subjects', JSON.stringify(updatedMap));
    if (saveSchoolSubjects) {
      saveSchoolSubjects({ disabledMap: updatedMap, customSubjects });
    }
  };

  const handleUncheckAll = () => {
    const currentSubjects = getSubjectsForView();
    const updatedMap = { ...disabledSubjectsMap };
    currentSubjects.forEach(s => {
      updatedMap[s.name] = true;
    });
    setDisabledSubjectsMap(updatedMap);
    localStorage.setItem('school_disabled_subjects', JSON.stringify(updatedMap));
    if (saveSchoolSubjects) {
      saveSchoolSubjects({ disabledMap: updatedMap, customSubjects });
    }
  };

  const handleAddSubject = async (e) => {
    e.preventDefault();
    const cleanName = newSubjectInput.trim().toUpperCase();
    if (!cleanName) return;

    if (cleanName === 'ADVISORY' || cleanName === 'HGP' || cleanName.includes('HOMEROOM GUIDANCE') || cleanName === 'MOTHER TONGUE') {
      await showAlert('Restricted Subject', '"ADVISORY", "HGP", and "MOTHER TONGUE" cannot be added as custom subjects.');
      return;
    }

    const newObj = {
      name: cleanName,
      band: selectedBand,
      gradeLevel: selectedModalGradeLevel,
      ...(selectedBand === 'Senior High School' ? { shsCategory: selectedShsCategory } : {})
    };

    const updatedCustom = [...customSubjects, newObj];
    setCustomSubjects(updatedCustom);
    localStorage.setItem('school_custom_subjects', JSON.stringify(updatedCustom));
    if (saveSchoolSubjects) {
      saveSchoolSubjects({ disabledMap: disabledSubjectsMap, customSubjects: updatedCustom });
    }
    setNewSubjectInput('');
    setIsSubjectModalOpen(false);
  };



  // Form state
  const [newSection, setNewSection] = useState({
    gradeLevel: '',
    sectionName: '',
    advisorId: '',
    advisoryMinutes: 300,
    hgpMinutes: 60,
    numberOfLearners: '',
    maleLearners: '',
    femaleLearners: ''
  });

  const offerings = (schoolInfo?.curricularOffering || []).map(o => String(o).toUpperCase());
  const showElem = offerings.length === 0 || offerings.some(o => o.includes('ELEM') || o.includes('KINDER') || o.includes('PRIMARY'));
  const showJHS = offerings.length === 0 || offerings.some(o => o.includes('JHS') || o.includes('JUNIOR') || o.includes('INTERMEDIATE'));
  const showSHS = offerings.length === 0 || offerings.some(o => o.includes('SHS') || o.includes('SENIOR') || o.includes('HIGH'));

  const availableGrades = [];
  if (showElem) {
    availableGrades.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED');
  }
  if (showJHS) {
    availableGrades.push('Grade 7', 'Grade 8', 'Grade 9', 'Grade 10');
  }
  if (showSHS) {
    availableGrades.push('Grade 11', 'Grade 12');
  }
  if (availableGrades.length === 0) {
    availableGrades.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12');
  }

  React.useEffect(() => {
    if (isModalOpen) {
      setIsMultigrade(false);
      setSelectedGrades([]);
      if (availableGrades.length > 0) {
        setNewSection({
          gradeLevel: availableGrades[0],
          sectionName: '',
          advisorId: '',
          advisoryMinutes: 300,
          hgpMinutes: 60,
          numberOfLearners: '',
          maleLearners: '',
          femaleLearners: ''
        });
      }
    }
  }, [isModalOpen]);

  const teachingPersonnel = personnel.filter(p => p.type === 'teaching');

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newSection.sectionName.trim()) {
      await showAlert('Validation Error', 'Please fill out Section Name.');
      return;
    }
    if (!newSection.advisorId) {
      await showAlert('Advisory Teacher Required', 'Please select an Advisory Teacher for the section.');
      return;
    }

    const isDuplicate = classSections.some(s => 
      s.gradeLevel === newSection.gradeLevel && 
      s.sectionName.toUpperCase().trim() === newSection.sectionName.toUpperCase().trim()
    );

    if (isDuplicate) {
      await showAlert('Duplicate Section', `A section named "${newSection.sectionName.toUpperCase().trim()}" already exists for ${newSection.gradeLevel}.`);
      return;
    }

    let finalGradeLevel = newSection.gradeLevel;
    let finalSectionType = 'MONO GRADE';

    if (isMultigrade) {
      if (selectedGrades.length < 2 || selectedGrades.length > 6) {
        await showAlert('Validation Error', 'Please select between 2 and 6 grade levels for a multigrade section.');
        return;
      }

      // Check if any of the selected grade levels are already in an existing multigrade section
      const alreadyTakenGrades = [];
      classSections.forEach(sec => {
        if (sec.sectionType === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ')) {
          const parts = String(sec.gradeLevel || '').split(' - ').map(s => s.trim());
          parts.forEach(g => {
            if (!alreadyTakenGrades.includes(g)) {
              alreadyTakenGrades.push(g);
            }
          });
        }
      });

      const conflictingGrades = selectedGrades.filter(g => alreadyTakenGrades.includes(g));
      if (conflictingGrades.length > 0) {
        await showAlert(
          'Multigrade Conflict', 
          `The following grade levels are already assigned to an existing multigrade combination: ${conflictingGrades.join(', ')}. They cannot be selected in another multigrade combination.`
        );
        return;
      }

      // Sort in order of availableGrades list
      const sortedGrades = [...selectedGrades].sort((a, b) => {
        return availableGrades.indexOf(a) - availableGrades.indexOf(b);
      });
      finalGradeLevel = sortedGrades.join(' - ');
      finalSectionType = 'MULTIGRADE';
    } else if (newSection.gradeLevel === 'NON-GRADED') {
      finalSectionType = 'NON GRADED';
    }

    addClassSection({
      gradeLevel: finalGradeLevel,
      sectionName: newSection.sectionName.toUpperCase().trim(),
      advisorId: newSection.advisorId,
      sectionType: finalSectionType,
      advisoryMinutes: Number(newSection.advisoryMinutes || 300),
      hgpMinutes: Number(newSection.hgpMinutes || 60),
      numberOfLearners: newSection.numberOfLearners,
      maleLearners: newSection.maleLearners,
      femaleLearners: newSection.femaleLearners
    });
    
    // Reset and close
    setNewSection({ gradeLevel: availableGrades[0] || 'Grade 7', sectionName: '', advisorId: '', advisoryMinutes: 300, hgpMinutes: 60, numberOfLearners: '', maleLearners: '', femaleLearners: '' });
    setIsMultigrade(false);
    setSelectedGrades([]);
    setIsModalOpen(false);
  };

  const alreadyTakenGrades = [];
  classSections.forEach(sec => {
    if (sec.sectionType === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ')) {
      const parts = String(sec.gradeLevel || '').split(' - ').map(s => s.trim());
      parts.forEach(g => {
        if (!alreadyTakenGrades.includes(g)) {
          alreadyTakenGrades.push(g);
        }
      });
    }
  });

  const filteredSections = classSections.filter(sec => {
    const advisor = personnel.find(p => p.id === sec.advisorId);
    const advisorName = advisor ? `${advisor.firstName} ${advisor.lastName}` : '';
    const hay = `${sec.gradeLevel} ${sec.sectionName} ${advisorName}`.toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });

  return (
    <section id="classes" className="view grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px', alignItems: 'start' }}>
      <article className="card">
        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <h2>Organized Classes Setup</h2>
              <p className="subtext">Configure curriculum-level sections and assign class advisers for the current school year.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn" 
                onClick={() => setIsModalOpen(true)}
                style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white' }}
              >
                + Add Regular Section
              </button>
              <button 
                type="button"
                className="btn" 
                onClick={() => setIsAralModalOpen(true)}
                style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '8px', padding: '0 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                + Add ARAL Section
              </button>
            </div>
          </div>

          {/* Total Enrollment Header Cards */}
          {(() => {
            const totalMale = classSections.reduce((acc, sec) => acc + (Number(sec.maleLearners) || 0), 0);
            const totalFemale = classSections.reduce((acc, sec) => acc + (Number(sec.femaleLearners) || 0), 0);
            const totalSchool = classSections.reduce((acc, sec) => {
              if (sec.maleLearners !== undefined && sec.maleLearners !== null && sec.femaleLearners !== undefined && sec.femaleLearners !== null && (sec.maleLearners !== '' || sec.femaleLearners !== '')) {
                return acc + (Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0);
              }
              return acc + (Number(sec.numberOfLearners) || 0);
            }, 0);

            let withinCount = 0;
            let belowCount = 0;
            let aboveCount = 0;

            classSections.forEach(sec => {
              const total = sec.numberOfLearners !== undefined && sec.numberOfLearners !== null ? Number(sec.numberOfLearners) : ((Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0));
              const statusObj = getSectionSizeStatus(sec.gradeLevel, total);
              if (statusObj.status === 'WITHIN STANDARD') withinCount++;
              else if (statusObj.status === 'BELOW STANDARD') belowCount++;
              else if (statusObj.status === 'ABOVE STANDARD') aboveCount++;
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0 20px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL ENROLLED</span>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e40af' }}>{totalSchool} <span style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6' }}>Learners</span></div>
                  </div>
                  <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MALE LEARNERS</span>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: '#166534' }}>{totalMale} <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>Males</span></div>
                  </div>
                  <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)', borderRadius: '12px', border: '1px solid #fbcfe8' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#be185d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FEMALE LEARNERS</span>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: '#9d174d' }}>{totalFemale} <span style={{ fontSize: '12px', fontWeight: '600', color: '#ec4899' }}>Females</span></div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1.5px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748B' }}>TOTAL SECTIONS</span>
                    <span style={{ fontSize: '15px', fontWeight: '900', color: '#1E293B' }}>{classSections.length}</span>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#DCFCE7', borderRadius: '10px', border: '1.5px solid #6EE7B7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#047857' }}>🟢 WITHIN STANDARD</span>
                    <span style={{ fontSize: '15px', fontWeight: '900', color: '#047857' }}>{withinCount}</span>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#FEF3C7', borderRadius: '10px', border: '1.5px solid #FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#D97706' }}>🟡 BELOW STANDARD</span>
                    <span style={{ fontSize: '15px', fontWeight: '900', color: '#D97706' }}>{belowCount}</span>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '10px', border: '1.5px solid #FCA5A5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#B91C1C' }}>🔴 ABOVE STANDARD</span>
                    <span style={{ fontSize: '15px', fontWeight: '900', color: '#B91C1C' }}>{aboveCount}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: '12px', margin: '20px 0', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Search by grade, section or adviser..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1 }}
            />
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                style={{
                  padding: '8px 12px',
                  background: viewMode === 'cards' ? '#f1f5f9' : 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: viewMode === 'cards' ? 'bold' : 'normal',
                  color: viewMode === 'cards' ? 'var(--blue)' : 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Grid/Cards View"
              >
                <span>▦</span> Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                style={{
                  padding: '8px 12px',
                  background: viewMode === 'list' ? '#f1f5f9' : 'white',
                  border: 'none',
                  borderLeft: '1.5px solid var(--line)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: viewMode === 'list' ? 'bold' : 'normal',
                  color: viewMode === 'list' ? 'var(--blue)' : 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Table/List View"
              >
                <span>☰</span> List
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <div style={{ overflowX: 'auto', border: '1.5px solid var(--line)', borderRadius: '16px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Grade Level</th>
                    <th>Section Name</th>
                    <th style={{ width: '130px', textAlign: 'center' }}>Total Learners</th>
                    <th>Section Size Standard</th>
                    <th>Class Adviser</th>
                    <th>Position</th>
                    <th style={{ width: '80px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSections.map((sec) => {
                    const advisor = personnel.find(p => p.id === sec.advisorId);
                    const totalLearnersCount = sec.numberOfLearners !== undefined && sec.numberOfLearners !== null ? Number(sec.numberOfLearners) : ((Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0));
                    const statusObj = getSectionSizeStatus(sec.gradeLevel, totalLearnersCount);

                    return (
                      <tr key={sec.id}>
                        <td>{sec.gradeLevel}</td>
                        <td>{sec.sectionName}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: totalLearnersCount > 0 ? '#047857' : '#B45309', background: totalLearnersCount > 0 ? '#DCFCE7' : '#FEF3C7', padding: '3px 8px', borderRadius: '6px' }}>
                            {totalLearnersCount}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: statusObj.bg,
                            color: statusObj.color,
                            border: `1px solid ${statusObj.border}`,
                            fontSize: '11px',
                            fontWeight: '800',
                            textTransform: 'uppercase'
                          }}>
                            ● {statusObj.status}
                          </span>
                        </td>
                        <td>
                          {advisor ? (
                            <span style={{ fontWeight: '700', color: 'var(--navy)' }}>{advisor.firstName} {advisor.lastName}</span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#EF4444', fontStyle: 'italic', fontWeight: '600' }}>ⓘ Unassigned Adviser</span>
                          )}
                        </td>
                        <td>{advisor ? advisor.position : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn secondary"
                              style={{ minHeight: '28px', padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => openEditModal(sec)}
                            >
                              ✎ Edit
                            </button>
                            <button
                              className="btn danger"
                              style={{ minHeight: '28px', padding: '4px 8px', fontSize: '11px' }}
                              onClick={async () => {
                                const confirmed = await showConfirm(
                                  'Remove Section',
                                  `Remove section ${sec.gradeLevel} - ${sec.sectionName}?`
                                );
                                if (confirmed) {
                                  removeClassSection(sec.id);
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSections.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '15px' }}>No sections found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: '20px',
                marginTop: '20px'
              }}>
                {filteredSections.map((sec) => {
                  const advisor = personnel.find(p => p.id === sec.advisorId);
                  
                  // Get grade level badge color style
                  let badgeBg = '#f0f9ff';
                  let badgeColor = '#0369a1';
                  if (String(sec.gradeLevel).toLowerCase().includes('kinder')) {
                    badgeBg = '#fdf2f8';
                    badgeColor = '#be185d';
                  } else if (String(sec.gradeLevel).toLowerCase().includes('grade 11') || String(sec.gradeLevel).toLowerCase().includes('grade 12')) {
                    badgeBg = '#faf5ff';
                    badgeColor = '#6b21a8';
                  }
                  
                  const hasEnrollment = (sec.maleLearners !== undefined && sec.maleLearners !== null && sec.maleLearners !== '') ||
                                        (sec.femaleLearners !== undefined && sec.femaleLearners !== null && sec.femaleLearners !== '') ||
                                        (sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '' && Number(sec.numberOfLearners) > 0);
                  const hasAdviser = Boolean(advisor);
                  const isCardIncomplete = !hasEnrollment || !hasAdviser;

                  return (
                    <div key={sec.id} style={{
                      background: isCardIncomplete ? '#FEF2F2' : 'white',
                      borderRadius: '16px',
                      border: isCardIncomplete ? '1.5px solid #FCA5A5' : '1.5px solid var(--line)',
                      padding: '20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s ease-in-out'
                    }}>
                      {/* Action buttons on card header */}
                      <div style={{ position: 'absolute', top: '14px', right: '14px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openEditModal(sec)}
                          style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✎ Edit Section
                        </button>
                        <button
                          onClick={async () => {
                            const confirmed = await showConfirm(
                              'Remove Section',
                              `Remove section ${sec.gradeLevel} - ${sec.sectionName}?`
                            );
                            if (confirmed) {
                              removeClassSection(sec.id);
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            color: '#ef4444',
                            opacity: 0.6,
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = 0.6}
                          title="Remove Section"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Badges / Header Info */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginRight: '140px' }}>
                        <span style={{
                          background: badgeBg,
                          color: badgeColor,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          letterSpacing: '0.02em'
                        }}>
                          {sec.gradeLevel}
                        </span>
                        {(() => {
                          const total = sec.numberOfLearners !== undefined && sec.numberOfLearners !== null ? Number(sec.numberOfLearners) : ((Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0));
                          const statusObj = getSectionSizeStatus(sec.gradeLevel, total);
                          return (
                            <span style={{
                              background: statusObj.bg,
                              color: statusObj.color,
                              border: `1px solid ${statusObj.border}`,
                              padding: '4px 10px',
                              borderRadius: '20px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase'
                            }}>
                              ● {statusObj.status}
                            </span>
                          );
                        })()}
                        {sec.sectionType && (
                          <span style={{
                            background: sec.sectionType === 'MULTIGRADE' ? '#fffbeb' : '#f0fdf4',
                            color: sec.sectionType === 'MULTIGRADE' ? '#b45309' : '#15803d',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase'
                          }}>
                            {sec.sectionType}
                          </span>
                        )}
                      </div>

                      {/* Section Title */}
                      <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                        {sec.sectionName}
                      </h3>

                      {/* Gender Learners & Magic Math Total Read-Only Box */}
                      {(() => {
                        if (!hasEnrollment) {
                          return (
                            <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.7)', borderRadius: '10px', border: '1px solid #FCA5A5', fontSize: '11px', color: '#991B1B', fontWeight: '700', margin: '4px 0' }}>
                              ⓘ No enrollment input. Click Edit Section above.
                            </div>
                          );
                        }

                        const mVal = Number(sec.maleLearners) || 0;
                        const fVal = Number(sec.femaleLearners) || 0;
                        const totVal = sec.numberOfLearners !== undefined && sec.numberOfLearners !== null ? sec.numberOfLearners : (mVal + fVal);

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(255, 255, 255, 0.8)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--line)', margin: '4px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: '700', color: '#334155' }}>
                              <span>Male: {mVal}  ·  Female: {fVal}</span>
                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#047857', background: '#DCFCE7', padding: '1px 8px', borderRadius: '6px' }}>
                                Total: {totVal} Learners
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Divider */}
                      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0' }} />

                      {/* Adviser Profile Read-Only Info Box */}
                      {(() => {
                        if (!advisor) {
                          return (
                            <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.7)', borderRadius: '10px', border: '1px solid #FCA5A5', fontSize: '11px', color: '#991B1B', fontWeight: '700', marginTop: 'auto' }}>
                              ⓘ Unassigned Adviser. Click Edit Section above.
                            </div>
                          );
                        }

                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 'auto', background: 'rgba(255, 255, 255, 0.8)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, var(--blue), var(--navy))',
                              color: 'white',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              {advisor.firstName.charAt(0)}{advisor.lastName.charAt(0)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '2px' }}>
                                Class Adviser
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--navy)' }}>
                                {advisor.firstName} {advisor.lastName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {advisor.position || 'Teacher'}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              {filteredSections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', border: '1.5px dashed var(--line)', borderRadius: '16px', color: 'var(--muted)', marginTop: '20px' }}>
                  No sections found matching your search.
                </div>
              )}
            </>
          )}
        </div>
      </article>

      {/* Subjects Taught Card (Adjacent to Organized Classes Setup) */}
      <article className="card">
        <div className="card-inner">
          <div className="roster-card-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--navy)' }}>Subjects Taught</h2>
              <p className="subtext">Configure active subjects offered by grade band in your school.</p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setNewSubjectInput('');
                setIsSubjectModalOpen(true);
              }}
              style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', minHeight: '36px', padding: '0 14px', borderRadius: '8px' }}
            >
              + Add Subject
            </button>
          </div>

          {/* Grade Band Selector Tabs & Grade Level Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
              {['Elementary', 'Junior High School', 'Senior High School'].map(band => (
                <button
                  key={band}
                  type="button"
                  onClick={() => {
                    setSelectedBand(band);
                    setSelectedGradeLevel('All');
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '11px',
                    fontWeight: selectedBand === band ? 'bold' : 'normal',
                    borderRadius: '6px',
                    border: 'none',
                    background: selectedBand === band ? 'white' : 'transparent',
                    color: selectedBand === band ? 'var(--blue)' : 'var(--muted)',
                    cursor: 'pointer',
                    boxShadow: selectedBand === band ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  {band === 'Junior High School' ? 'JHS' : band === 'Senior High School' ? 'SHS' : band}
                </button>
              ))}
            </div>

            {/* Search & Filter Controls */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              {/* Subject Search Bar */}
              <div style={{ flex: 1, minWidth: '160px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search subject..."
                  value={subjectSearchQuery}
                  onChange={(e) => setSubjectSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '35px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--line)',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'var(--navy)',
                    background: 'white'
                  }}
                />
              </div>

              {/* Grade Level Dropdown Filter */}
              <div style={{ minWidth: '120px' }}>
                <select
                  value={selectedGradeLevel}
                  onChange={(e) => setSelectedGradeLevel(e.target.value)}
                  style={{ width: '100%', height: '35px', padding: '0 8px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', background: 'white' }}
                >
                  <option value="All">All {selectedBand === 'Junior High School' ? 'JHS' : selectedBand === 'Senior High School' ? 'SHS' : 'Elem'} Grades</option>
                  {selectedBand === 'Elementary' && (
                    <>
                      <option value="Kinder">Kinder</option>
                      <option value="Grade 1">Grade 1</option>
                      <option value="Grade 2">Grade 2</option>
                      <option value="Grade 3">Grade 3</option>
                      <option value="Grade 4">Grade 4</option>
                      <option value="Grade 5">Grade 5</option>
                      <option value="Grade 6">Grade 6</option>
                    </>
                  )}
                  {selectedBand === 'Junior High School' && (
                    <>
                      <option value="Grade 7">Grade 7</option>
                      <option value="Grade 8">Grade 8</option>
                      <option value="Grade 9">Grade 9</option>
                      <option value="Grade 10">Grade 10</option>
                    </>
                  )}
                  {selectedBand === 'Senior High School' && (
                    <>
                      <option value="Grade 11">Grade 11</option>
                      <option value="Grade 12">Grade 12</option>
                    </>
                  )}
                </select>
              </div>

              {/* SHS Category Dropdown Filter */}
              {selectedBand === 'Senior High School' && (
                <div style={{ minWidth: '140px' }}>
                  <select
                    value={selectedShsFilterCategory}
                    onChange={(e) => setSelectedShsFilterCategory(e.target.value)}
                    style={{ width: '100%', height: '35px', padding: '0 8px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', background: 'white' }}
                  >
                    <option value="All">All SHS Categories</option>
                    <option value="SHS">SHS (General)</option>
                    <option value="SHS-CORE SUBJECTS">SHS - Core Subjects</option>
                    <option value="SHS-APPLIED SUBJECTS">SHS - Applied Subjects</option>
                    <option value="SHS-SPECIALIZED SUBJECTS">SHS - Specialized Subjects</option>
                    <option value="SSHS-CORE">SSHS - Core</option>
                    <option value="SSHS-ACADEMIC">SSHS - Academic</option>
                    <option value="SSHS-TECHPRO">SSHS - TechPro</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Bulk Check/Uncheck Action Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px 0', padding: '0 2px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--navy)' }}>
              {getSubjectsForView().length} Subjects Available
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCheckAll}
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#15803d',
                  background: '#dcfce7',
                  border: '1.5px solid #bbf7d0',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                ✓ Check All
              </button>
              <button
                type="button"
                onClick={handleUncheckAll}
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#b91c1c',
                  background: '#fee2e2',
                  border: '1.5px solid #fecaca',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                ✕ Uncheck All
              </button>
            </div>
          </div>

          {/* Subjects List with On/Off Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
            {getSubjectsForView().map((sub, index) => (
              <div
                key={sub.name || index}
                onClick={() => toggleSubject(sub.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: sub.enabled ? '1.5px solid #bbf7d0' : '1.5px solid var(--line)',
                  background: sub.enabled ? '#ffffff' : '#f8fafc',
                  opacity: sub.enabled ? 1 : 0.65,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: sub.enabled ? 'var(--navy)' : 'var(--muted)' }}>
                    {sub.name}
                  </span>
                  {selectedBand === 'Senior High School' && sub.shsCategory && (
                    <span style={{
                      fontSize: '9px',
                      fontWeight: '800',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: sub.shsCategory.includes('CORE') ? '#e0f2fe' : sub.shsCategory.includes('APPLIED') ? '#fef3c7' : '#f3e8ff',
                      color: sub.shsCategory.includes('CORE') ? '#0369a1' : sub.shsCategory.includes('APPLIED') ? '#b45309' : '#6b21a8'
                    }}>
                      {sub.shsCategory.replace('SHS-', '').replace(' SUBJECTS', '')}
                    </span>
                  )}
                </div>

                {/* Right-aligned Checkbox & Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: sub.enabled ? '#15803d' : '#94a3b8' }}>
                    {sub.enabled ? 'TAUGHT' : 'OFF'}
                  </span>
                  <input
                    type="checkbox"
                    checked={sub.enabled}
                    onChange={() => toggleSubject(sub.name)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#15803d' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      {/* Add Section Modal Popup */}
      {isModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '560px', padding: '32px 24px', background: 'white', borderRadius: '24px', border: '2.5px solid var(--outline)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'scaleUp 0.2s forwards' }}>
            <div className="modal-head" style={{ border: 0, padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', margin: 0, color: 'var(--navy)', fontWeight: 800 }}>Add Section</h2>
                <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Register a grade-level section and assign a teaching personnel as adviser.</p>
              </div>
              <button className="btn secondary" onClick={() => setIsModalOpen(false)} style={{ borderRadius: '50%', width: '36px', height: '36px', minWidth: '36px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}>&times;</button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ display: 'grid', gap: '20px' }}>
              <div style={{ display: 'grid', gap: '15px', borderBottom: '1.5px solid var(--line)', paddingBottom: '20px' }}>
                <div className="full">
                  <label className="checkline" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, color: 'var(--navy)', fontWeight: 'bold' }}>
                    <input
                      type="checkbox"
                      checked={isMultigrade}
                      onChange={(e) => {
                        setIsMultigrade(e.target.checked);
                        setSelectedGrades([]);
                      }}
                      style={{ width: 'auto', minHeight: 'auto', cursor: 'pointer' }}
                    />
                    THIS IS A MULTIGRADE SECTION
                  </label>
                </div>
                {isMultigrade ? (
                  <div className="full" style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 'bold' }}>SELECT GRADE LEVELS (2 TO 6 COMBINATIONS)</label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: 'var(--blue-50, #F0F9FF)', padding: '12px', borderRadius: '12px', border: '1.5px solid var(--line, #BAE6FD)', marginTop: '8px' }}>
                      {availableGrades.filter(g => g !== 'Kinder' && g !== 'NON-GRADED').map((g) => {
                        const isChecked = selectedGrades.includes(g);
                        const isDisabled = alreadyTakenGrades.includes(g);
                        return (
                          <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: isDisabled ? 'not-allowed' : 'pointer', margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '13px', fontWeight: 'bold', color: isDisabled ? '#94a3b8' : 'var(--navy)', opacity: isDisabled ? 0.6 : 1 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              style={{ width: 'auto', minHeight: 'auto', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedGrades(selectedGrades.filter(x => x !== g));
                                } else {
                                  if (selectedGrades.length >= 6) {
                                    alert('You can select a maximum of 6 grade levels.');
                                    return;
                                  }
                                  setSelectedGrades([...selectedGrades, g]);
                                }
                              }}
                            />
                            {g}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label>Grade Level</label>
                    <select
                      value={newSection.gradeLevel}
                      onChange={(e) => setNewSection({ ...newSection, gradeLevel: e.target.value })}
                    >
                      {availableGrades.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label>Section Name</label>
                  <input
                    placeholder="SECTION NAME"
                    value={newSection.sectionName}
                    onChange={(e) => setNewSection({ ...newSection, sectionName: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '14px' }}>♂</span> Male Learners
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newSection.maleLearners !== undefined && newSection.maleLearners !== null ? newSection.maleLearners : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const mVal = raw === '' ? '' : Math.max(0, Number(raw));
                        const fVal = newSection.femaleLearners !== undefined && newSection.femaleLearners !== null && newSection.femaleLearners !== '' ? Number(newSection.femaleLearners) : 0;
                        const total = (mVal === '' ? 0 : Number(mVal)) + fVal;
                        setNewSection(prev => ({
                          ...prev,
                          maleLearners: mVal,
                          numberOfLearners: total
                        }));
                      }}
                      style={{ width: '100%', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', fontWeight: 'bold', background: 'white' }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#9d174d', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '14px' }}>♀</span> Female Learners
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newSection.femaleLearners !== undefined && newSection.femaleLearners !== null ? newSection.femaleLearners : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const fVal = raw === '' ? '' : Math.max(0, Number(raw));
                        const mVal = newSection.maleLearners !== undefined && newSection.maleLearners !== null && newSection.maleLearners !== '' ? Number(newSection.maleLearners) : 0;
                        const total = mVal + (fVal === '' ? 0 : Number(fVal));
                        setNewSection(prev => ({
                          ...prev,
                          femaleLearners: fVal,
                          numberOfLearners: total
                        }));
                      }}
                      style={{ width: '100%', border: '1px solid #fbcfe8', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', fontWeight: 'bold', background: 'white' }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      👥 Total Learners
                    </label>
                    <input
                      type="number"
                      readOnly
                      placeholder="Auto-calculated"
                      value={newSection.numberOfLearners !== undefined && newSection.numberOfLearners !== null ? newSection.numberOfLearners : ''}
                      style={{ background: '#f1f5f9', fontWeight: '800', color: '#047857', border: '1.5px solid #a7f3d0' }}
                    />
                  </div>

                  {(() => {
                    const targetGrade = isMultigrade ? (selectedGrades[0] || 'Grade 1') : newSection.gradeLevel;
                    const statusObj = getSectionSizeStatus(targetGrade, newSection.numberOfLearners);
                    return (
                      <div style={{
                        gridColumn: '1 / -1',
                        marginTop: '4px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: statusObj.bg,
                        color: statusObj.color,
                        border: `1.5px solid ${statusObj.border}`,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span>DepEd Section Size Standard: <strong>{statusObj.status}</strong></span>
                        <span style={{ fontSize: '11px', fontWeight: '700' }}>{statusObj.label}</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="full">
                  <label>Section Adviser</label>
                  <select
                    value={newSection.advisorId}
                    onChange={(e) => setNewSection({ ...newSection, advisorId: e.target.value })}
                  >
                    <option value="">No advisor assigned yet</option>
                    {teachingPersonnel.map((p) => {
                      const assignedSecs = classSections.filter(s => s.advisorId && String(s.advisorId) === String(p.id));
                      const secInfo = assignedSecs.length > 0
                        ? ` — (${assignedSecs.map(s => `${s.gradeLevel} ${s.sectionName}`).join(', ')})`
                        : '';
                      return (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} · {p.position}{secInfo}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button className="btn" type="submit">Add Section</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subject Modal Popup */}
      {isSubjectModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '480px', padding: '28px 24px', background: 'white', borderRadius: '24px', border: '2.5px solid var(--outline)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'scaleUp 0.2s forwards' }}>
            <div className="modal-head" style={{ border: 0, padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--navy)', fontWeight: 800 }}>Add New Subject</h2>
                <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Register a new subject for a grade band in your school.</p>
              </div>
              <button className="btn secondary" type="button" onClick={() => setIsSubjectModalOpen(false)} style={{ borderRadius: '50%', width: '34px', height: '34px', minWidth: '34px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}>&times;</button>
            </div>

            <form onSubmit={async (e) => {
              await handleAddSubject(e);
              setIsSubjectModalOpen(false);
            }} style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', marginBottom: '6px', display: 'block' }}>Grade Band</label>
                <select
                  value={selectedBand}
                  onChange={(e) => setSelectedBand(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px', background: 'white', fontWeight: 'bold', color: 'var(--navy)' }}
                >
                  <option value="Elementary">Elementary</option>
                  <option value="Junior High School">Junior High School</option>
                  <option value="Senior High School">Senior High School</option>
                </select>
              </div>

              {selectedBand === 'Senior High School' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', marginBottom: '6px', display: 'block' }}>SHS Subject Category</label>
                  <select
                    value={selectedShsCategory}
                    onChange={(e) => setSelectedShsCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px', background: 'white', fontWeight: 'bold', color: 'var(--navy)' }}
                  >
                    <option value="SHS">SHS (General)</option>
                    <option value="SHS-CORE SUBJECTS">SHS - Core Subjects</option>
                    <option value="SHS-APPLIED SUBJECTS">SHS - Applied Subjects</option>
                    <option value="SHS-SPECIALIZED SUBJECTS">SHS - Specialized Subjects</option>
                    <option value="SSHS-CORE">SSHS - Core</option>
                    <option value="SSHS-ACADEMIC">SSHS - Academic</option>
                    <option value="SSHS-TECHPRO">SSHS - TechPro</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', marginBottom: '6px', display: 'block' }}>Target Grade Level</label>
                <select
                  value={selectedModalGradeLevel}
                  onChange={(e) => setSelectedModalGradeLevel(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px', background: 'white', fontWeight: 'bold', color: 'var(--navy)' }}
                >
                  <option value="All">All {selectedBand} Grades</option>
                  {selectedBand === 'Elementary' && (
                    <>
                      <option value="Kinder">Kinder</option>
                      <option value="Grade 1">Grade 1</option>
                      <option value="Grade 2">Grade 2</option>
                      <option value="Grade 3">Grade 3</option>
                      <option value="Grade 4">Grade 4</option>
                      <option value="Grade 5">Grade 5</option>
                      <option value="Grade 6">Grade 6</option>
                    </>
                  )}
                  {selectedBand === 'Junior High School' && (
                    <>
                      <option value="Grade 7">Grade 7</option>
                      <option value="Grade 8">Grade 8</option>
                      <option value="Grade 9">Grade 9</option>
                      <option value="Grade 10">Grade 10</option>
                    </>
                  )}
                  {selectedBand === 'Senior High School' && (
                    <>
                      <option value="Grade 11">Grade 11</option>
                      <option value="Grade 12">Grade 12</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', marginBottom: '6px', display: 'block' }}>Subject Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  type="text"
                  placeholder="e.g. COMPUTER PROGRAMMING 101"
                  value={newSubjectInput}
                  onChange={(e) => setNewSubjectInput(e.target.value.toUpperCase())}
                  required
                  autoFocus
                  style={{ width: '100%', textTransform: 'uppercase', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--line)', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn secondary" onClick={() => setIsSubjectModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn" style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white' }}>+ Add Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ARAL Section Modal */}
      {isAralModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '540px', maxWidth: '92vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>➕ Add ARAL Section</h3>
              <button type="button" onClick={() => setIsAralModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleAralSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '6px' }}>ARAL Basis</label>
                <div style={{ display: 'flex', background: '#F1F5F9', border: '1.5px solid #CBD5E1', borderRadius: '12px', padding: '3px', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setAralBasis('grade')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '9px',
                      border: 'none',
                      background: aralBasis === 'grade' ? '#0284C7' : 'transparent',
                      color: aralBasis === 'grade' ? 'white' : '#475569',
                      fontWeight: '800',
                      fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: aralBasis === 'grade' ? '0 2px 6px rgba(2, 132, 199, 0.2)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    (1) Grade Level
                  </button>
                  <button
                    type="button"
                    onClick={() => setAralBasis('assessment')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '9px',
                      border: 'none',
                      background: aralBasis === 'assessment' ? '#0284C7' : 'transparent',
                      color: aralBasis === 'assessment' ? 'white' : '#475569',
                      fontWeight: '800',
                      fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: aralBasis === 'assessment' ? '0 2px 6px rgba(2, 132, 199, 0.2)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    (2) Assessment Profile (Table 2)
                  </button>
                </div>
              </div>

              {/* Grade Level (Shown ONLY when basis is Grade Level) */}
              {aralBasis === 'grade' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>Grade Level</label>
                  <select
                    value={aralGrade}
                    onChange={(e) => setAralGrade(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                  >
                    {['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Assessment Profile Option Cards (DepEd Table 2 - No Grade Level Needed) */}
              {aralBasis === 'assessment' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '6px' }}>
                    Select Assessment Tool & Domain (DepEd Table 2)
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    {/* Tool 1: CRLA */}
                    {(() => {
                      const isSel = aralToolKey === 'crla';
                      return (
                        <div
                          onClick={() => {
                            setAralToolKey('crla');
                            setAralProfileLevel(ARAL_TOOLS.crla.levels[0]);
                          }}
                          style={{
                            border: `2px solid ${isSel ? '#0284C7' : '#E2E8F0'}`,
                            background: isSel ? '#F0F9FF' : '#FAFAFA',
                            borderRadius: '10px',
                            padding: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ fontSize: '14px', marginBottom: '2px', fontWeight: 'bold', color: isSel ? '#0369A1' : '#64748B' }}>☷</div>
                          <div style={{ fontSize: '12px', fontWeight: '800', color: isSel ? '#0369A1' : '#334155' }}>CRLA</div>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600' }}>Reading (Gr 1-3)</div>
                        </div>
                      );
                    })()}

                    {/* Tool 2: Phil-IRI */}
                    {(() => {
                      const isSel = aralToolKey === 'philIri';
                      return (
                        <div
                          onClick={() => {
                            setAralToolKey('philIri');
                            setAralProfileLevel(ARAL_TOOLS.philIri.levels[0]);
                          }}
                          style={{
                            border: `2px solid ${isSel ? '#0284C7' : '#E2E8F0'}`,
                            background: isSel ? '#F0F9FF' : '#FAFAFA',
                            borderRadius: '10px',
                            padding: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ fontSize: '14px', marginBottom: '2px', fontWeight: 'bold', color: isSel ? '#0369A1' : '#64748B' }}>☷</div>
                          <div style={{ fontSize: '12px', fontWeight: '800', color: isSel ? '#0369A1' : '#334155' }}>Phil-IRI</div>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600' }}>Reading (Gr 4-10)</div>
                        </div>
                      );
                    })()}

                    {/* Tool 3: RMA */}
                    {(() => {
                      const isSel = aralToolKey === 'rma';
                      return (
                        <div
                          onClick={() => {
                            setAralToolKey('rma');
                            setAralProfileLevel(ARAL_TOOLS.rma.levels[0]);
                          }}
                          style={{
                            border: `2px solid ${isSel ? '#0284C7' : '#E2E8F0'}`,
                            background: isSel ? '#F0F9FF' : '#FAFAFA',
                            borderRadius: '10px',
                            padding: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ fontSize: '14px', marginBottom: '2px', fontWeight: 'bold', color: isSel ? '#0369A1' : '#64748B' }}>◷</div>
                          <div style={{ fontSize: '12px', fontWeight: '800', color: isSel ? '#0369A1' : '#334155' }}>RMA</div>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600' }}>Math (Gr 1-10)</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Level Dropdown */}
                  {(() => {
                    const toolObj = ARAL_TOOLS[aralToolKey] || ARAL_TOOLS.crla;
                    const levels = toolObj.levels;
                    return (
                      <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#0369A1', marginBottom: '4px' }}>
                          ⓘ {toolObj.tool} Assessment Profile Level:
                        </label>
                        <select
                          value={levels.includes(aralProfileLevel) ? aralProfileLevel : levels[0]}
                          onChange={(e) => setAralProfileLevel(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '12px', fontWeight: '700', color: '#0F172A' }}
                        >
                          {levels.map(lvl => (
                            <option key={lvl} value={lvl}>{lvl}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>Number of ARAL Learners</label>
                <input type="number" min="1" required value={aralLearners} onChange={(e) => setAralLearners(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>Section Tutor *</label>
                <select value={aralTutorId} onChange={(e) => setAralTutorId(e.target.value)} required style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px' }}>
                  <option value="">Select tutor personnel...</option>
                  {activePersonnel.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.position || 'Tutor'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsAralModalOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#16A34A', color: 'white', fontWeight: '800', cursor: 'pointer', fontSize: '13px' }}>Create ARAL Section</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT SECTION MODAL ── */}
      {editModalSection && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '24px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            animation: 'modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1.5px solid var(--line)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                  ✎ Edit Section Setup
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600' }}>
                  {editModalSection.gradeLevel} — {editModalSection.sectionName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditModalSection(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSection} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Grade Level & Section Name Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Grade Level
                  </label>
                  <select
                    value={editGradeLevel}
                    onChange={(e) => setEditGradeLevel(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px', fontWeight: '600', color: 'var(--navy)' }}
                  >
                    {availableGrades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Section Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editSectionName}
                    onChange={(e) => setEditSectionName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px', fontWeight: '600', color: 'var(--navy)' }}
                  />
                </div>
              </div>
              {/* Gender Learners Input */}
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <label style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Class Learners Enrollment
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Male Learners</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editMale}
                      onChange={(e) => setEditMale(e.target.value)}
                      style={{ width: '100%', border: '1.5px solid #bfdbfe', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', fontWeight: 'bold', background: 'white' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#be185d', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>Female Learners</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editFemale}
                      onChange={(e) => setEditFemale(e.target.value)}
                      style={{ width: '100%', border: '1.5px solid #fbcfe8', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', fontWeight: 'bold', background: 'white' }}
                    />
                  </div>
                </div>

                {(() => {
                  const totalLearnersCount = (Number(editMale) || 0) + (Number(editFemale) || 0);
                  const statusObj = getSectionSizeStatus(editGradeLevel, totalLearnersCount);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#047857' }}>Calculated Total Learners:</span>
                        <span style={{ fontSize: '14px', fontWeight: '900', color: '#047857', background: '#dcfce7', padding: '2px 10px', borderRadius: '10px' }}>
                          {totalLearnersCount} Learners
                        </span>
                      </div>
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: statusObj.bg,
                        color: statusObj.color,
                        border: `1.5px solid ${statusObj.border}`,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span>DepEd Section Size Standard: <strong>{statusObj.status}</strong></span>
                        <span style={{ fontSize: '11px', fontWeight: '700' }}>{statusObj.label}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Class Adviser Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Assign Class Adviser
                </label>
                <select
                  value={editAdvisorId}
                  onChange={(e) => setEditAdvisorId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px', fontWeight: '600', color: 'var(--navy)' }}
                >
                  <option value="">-- Select Adviser --</option>
                  {teachingPersonnel.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.position || 'Teacher'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setEditModalSection(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: 'var(--blue)', color: 'white', fontWeight: '800', cursor: 'pointer', fontSize: '13px' }}>
                  Save Section Setup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STICKY BOTTOM JOURNEY ACTION BAR */}
      <div className="sticky-journey-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            background: 'rgba(59, 130, 246, 0.25)',
            color: '#60A5FA',
            border: '1px solid rgba(96, 165, 250, 0.4)',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: '900'
          }}>
            NODE 05 OF 09
          </span>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#F8FAFC' }}>
              Organized Classes Setup
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Confirm section organization and proceed to Node 05 (Workload & Timetable).
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => setActiveView('nodemap')}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#E2E8F0',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            🗺️ Node Map
          </button>

          <button
            type="button"
            onClick={() => completeNode('classes', 'workload')}
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Save & Continue to Workload ➔
          </button>
        </div>
      </div>
    </section>
  );
}
