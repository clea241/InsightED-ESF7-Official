import React, { useState } from 'react';
import { useApp, isSpecialProgramSubjectAllowed } from '../context/AppContext';
import PortalHeader from '../components/PortalHeader';


const MASTER_SUBJECTS_CATALOG = {
  Elementary: {
    Kinder: [
      'KINDER BLOCKS OF TIME'
    ],
    'Grade 1': [
      'LANGUAGE', 'READING AND LITERACY', 'MAKABANSA', 'MATHEMATICS', 'GMRC',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
      'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 2': [
      'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'GMRC',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
      'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 3': [
      'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
      'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 4': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 5': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 6': [
      'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
      'EPP/TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
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
      'ARAL - MATH', 'ARAL - SCIENCE'
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
      'PE AND HEALTH'
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
    'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 2': [
    'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'GMRC',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 3': [
    'MAKABANSA', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT',
    'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 4': [
    'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
    'EPP/TLE', 'EPP / TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 5': [
    'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
    'EPP/TLE', 'EPP / TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 6': [
    'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE',
    'EPP/TLE', 'EPP / TLE', 'MAPEH', 'GMRC', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ]
};

const getSectionSizeStatus = (gradeLevel, totalLearners) => {
  const total = Number(totalLearners) || 0;
  if (!total || total === 0) {
    return { status: 'NO ENROLLMENT', short: 'UNSET', label: 'No Enrollment Input', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' };
  }
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
  const { classSections, setClassSections, addClassSection, updateSectionDetails, updateSectionAdviser, updateSectionLearners, removeClassSection, personnel, setPersonnel, schoolInfo, saveSchoolSubjects, showAlert, showConfirm, showToast, setHasUnsavedChanges, completeNode, setActiveView } = useApp();

  const handleClearOrganizedClasses = async () => {
    const totalCount = (classSections || []).length;
    const confirmed = await showConfirm(
      "Clear All Organized Classes?",
      `Are you sure you want to clear all ${totalCount} organized class sections in your local draft? This allows you to set up sections manually from scratch. (Your database remains safe and untouched until final submission in Validation Center).`
    );
    if (!confirmed) return;

    try {
      // 1. Reset classSections in React state
      if (typeof setClassSections === 'function') {
        setClassSections([]);
      }

      // 2. Clear from local storage and IndexedDB draft (zero database deletions)
      if (schoolInfo?.schoolId && schoolInfo?.schoolYear) {
        const draftKey = `draft_${schoolInfo.schoolId}_${schoolInfo.schoolYear}`;
        const existingDraft = localStorage.getItem(draftKey);
        if (existingDraft) {
          try {
            const parsed = JSON.parse(existingDraft);
            if (parsed) {
              parsed.classSections = [];
              parsed.sections = [];
              parsed.sectionsCleared = true;
              localStorage.setItem(draftKey, JSON.stringify(parsed));
            }
          } catch (e) {}
        }
      }

      if (typeof setHasUnsavedChanges === 'function') setHasUnsavedChanges(true);
      if (showToast) showToast("✓ Organized classes cleared in local draft.");
    } catch (err) {
      if (showAlert) await showAlert("Error", "Failed to clear organized classes: " + err.message);
    }
  };
  const [modalCategory, setModalCategory] = useState('REGULAR'); // 'REGULAR', 'ARAL', 'REMEDIAL_ENRICHMENT'
  const [remedialType, setRemedialType] = useState('REMEDIAL'); // 'REMEDIAL' or 'ENRICHMENT'
  const [remedialGrade, setRemedialGrade] = useState('Grade 1');
  const [remedialSectionName, setRemedialSectionName] = useState('');
  const [remedialMale, setRemedialMale] = useState('');
  const [remedialFemale, setRemedialFemale] = useState('');
  const [remedialTeacherId, setRemedialTeacherId] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMultigrade, setIsMultigrade] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'cards' or 'list' (default to 'list')
  const [isInlineAdding, setIsInlineAdding] = useState(false);
  const [inlineRowData, setInlineRowData] = useState({
    gradeLevel: 'Grade 7',
    selectedGrades: [],
    sectionName: '',
    maleLearners: '',
    femaleLearners: '',
    advisorId: '',
    sectionType: 'MONO GRADE'
  });
  const [isInlineAddingAral, setIsInlineAddingAral] = useState(false);
  const [inlineAralData, setInlineAralData] = useState({
    aralBasis: 'grade',
    aralGrade: 'Grade 3',
    aralToolKey: 'crla',
    aralProfileLevel: 'Emerging',
    sectionName: '',
    aralLearners: '15',
    tutorId: ''
  });

  const [isInlineAddingRemedial, setIsInlineAddingRemedial] = useState(false);
  const [inlineRemedialData, setInlineRemedialData] = useState({
    sectionType: 'REMEDIAL',
    gradeLevel: 'Grade 3',
    sectionName: '',
    maleLearners: '',
    femaleLearners: '',
    advisorId: ''
  });

  const handleSaveInlineAralSection = async () => {
    if (!inlineAralData.sectionName.trim()) {
      if (showAlert) await showAlert('Validation Error', 'Please enter a section name for the ARAL section.');
      return;
    }

    let finalGradeLevel = inlineAralData.aralGrade;
    let finalSectionType = 'ARAL - GRADE LEVEL';

    if (inlineAralData.aralBasis === 'assessment') {
      const toolNames = { crla: 'CRLA', philIri: 'Phil-IRI', rma: 'RMA' };
      const toolName = toolNames[inlineAralData.aralToolKey] || 'CRLA';
      finalGradeLevel = `${toolName} - ${inlineAralData.aralProfileLevel}`;
      finalSectionType = `ARAL - ${toolName.toUpperCase()}`;
    }

    const isDuplicate = classSections.some(s => 
      s.gradeLevel === finalGradeLevel && 
      s.sectionName.toUpperCase().trim() === inlineAralData.sectionName.toUpperCase().trim()
    );

    if (isDuplicate) {
      if (showAlert) await showAlert('Duplicate Section', `An ARAL section named "${inlineAralData.sectionName.toUpperCase().trim()}" already exists for ${finalGradeLevel}.`);
      return;
    }

    const totalLearners = Number(inlineAralData.aralLearners) || 15;

    const toolNames = { crla: 'CRLA', philIri: 'Phil-IRI', rma: 'RMA' };
    const toolName = toolNames[inlineAralData.aralToolKey] || 'CRLA';

    await addClassSection({
      gradeLevel: finalGradeLevel,
      sectionName: inlineAralData.sectionName.toUpperCase().trim(),
      advisorId: inlineAralData.tutorId,
      adviserId: inlineAralData.tutorId,
      tutorId: inlineAralData.tutorId,
      sectionType: finalSectionType,
      aralBasis: inlineAralData.aralBasis,
      aralGrade: inlineAralData.aralGrade,
      aralToolKey: inlineAralData.aralToolKey,
      aralTool: toolName,
      aralProfileLevel: inlineAralData.aralProfileLevel,
      aralLearners: totalLearners,
      numberOfLearners: totalLearners,
      maleLearners: null,
      femaleLearners: null
    });

    if (showToast) showToast(`✓ ARAL Section "${inlineAralData.sectionName.toUpperCase().trim()}" added successfully.`);

    setInlineAralData({
      aralBasis: 'grade',
      aralGrade: 'Grade 3',
      aralToolKey: 'crla',
      aralProfileLevel: 'Emerging',
      sectionName: '',
      aralLearners: '15',
      tutorId: ''
    });
    setIsInlineAddingAral(false);
  };

  const handleSaveInlineRemedialSection = async () => {
    if (!inlineRemedialData.sectionName.trim()) {
      if (showAlert) await showAlert('Validation Error', 'Please enter a section name.');
      return;
    }

    const isDuplicate = classSections.some(s => 
      s.gradeLevel === inlineRemedialData.gradeLevel && 
      s.sectionName.toUpperCase().trim() === inlineRemedialData.sectionName.toUpperCase().trim()
    );

    if (isDuplicate) {
      if (showAlert) await showAlert('Duplicate Section', `A section named "${inlineRemedialData.sectionName.toUpperCase().trim()}" already exists for ${inlineRemedialData.gradeLevel}.`);
      return;
    }

    const calcMale = inlineRemedialData.maleLearners !== '' && inlineRemedialData.maleLearners !== null ? Number(inlineRemedialData.maleLearners) : null;
    const calcFemale = inlineRemedialData.femaleLearners !== '' && inlineRemedialData.femaleLearners !== null ? Number(inlineRemedialData.femaleLearners) : null;
    const total = (calcMale || 0) + (calcFemale || 0);

    await addClassSection({
      gradeLevel: inlineRemedialData.gradeLevel || 'Grade 3',
      sectionName: inlineRemedialData.sectionName.toUpperCase().trim(),
      advisorId: inlineRemedialData.advisorId,
      adviserId: inlineRemedialData.advisorId,
      sectionType: inlineRemedialData.sectionType || 'REMEDIAL',
      advisoryMinutes: 300,
      hgpMinutes: 60,
      numberOfLearners: total,
      maleLearners: calcMale,
      femaleLearners: calcFemale
    });

    if (showToast) showToast(`✓ ${inlineRemedialData.sectionType === 'REMEDIAL' ? 'Remedial' : 'Enrichment'} Section "${inlineRemedialData.sectionName.toUpperCase().trim()}" added successfully.`);

    setInlineRemedialData({
      sectionType: 'REMEDIAL',
      gradeLevel: 'Grade 3',
      sectionName: '',
      maleLearners: '',
      femaleLearners: '',
      advisorId: ''
    });
    setIsInlineAddingRemedial(false);
  };

  const [isAralModalOpen, setIsAralModalOpen] = useState(false);
  const [aralBasis, setAralBasis] = useState('grade');
  const [aralGrade, setAralGrade] = useState('Grade 3');
  const [aralToolKey, setAralToolKey] = useState('crla'); // 'crla', 'philIri', 'rma'
  const [aralProfileLevel, setAralProfileLevel] = useState('Emerging');
  const [aralLearners, setAralLearners] = useState(15);
  const [aralTutorId, setAralTutorId] = useState('');

  const handleRemedialSubmit = async (e) => {
    e.preventDefault();
    if (!remedialSectionName.trim()) {
      await showAlert('Validation Error', 'Please enter a section name.');
      return;
    }

    const calcMale = remedialMale !== '' && remedialMale !== null && remedialMale !== undefined ? Number(remedialMale) : 0;
    const calcFemale = remedialFemale !== '' && remedialFemale !== null && remedialFemale !== undefined ? Number(remedialFemale) : 0;
    const computedTotal = calcMale + calcFemale;

    await addClassSection({
      gradeLevel: remedialGrade,
      sectionName: remedialSectionName.trim().toUpperCase(),
      advisorId: remedialTeacherId || null,
      sectionType: remedialType,
      numberOfLearners: computedTotal,
      maleLearners: calcMale,
      femaleLearners: calcFemale
    });

    setIsModalOpen(false);
    setRemedialSectionName('');
    setRemedialMale('');
    setRemedialFemale('');
    setRemedialTeacherId('');
  };

  const ARAL_TOOLS = {
    crla: {
      domain: 'Reading',
      tool: 'CRLA',
      toolFull: 'Comprehensive Rapid Literacy Assessment (Grades 1-3)',
      domainDesc: 'Reading (Gr 1-3)',
      levels: ['Emerging', 'Developing', 'Transitioning', 'Reading at Grade Level']
    },
    philIri: {
      domain: 'Reading',
      tool: 'Phil-IRI',
      toolFull: 'Philippine Informal Reading Inventory (Grades 4-10)',
      domainDesc: 'Reading (Gr 4-10)',
      levels: ['Frustration', 'Instructional', 'Independent']
    },
    rma: {
      domain: 'Mathematics',
      tool: 'RMA',
      toolFull: 'Rapid Math Assessment (Grades 1-10)',
      domainDesc: 'Math (Gr 1-10)',
      levels: ['Not Proficient', 'Low Proficient', 'Nearly Proficient', 'Proficient', 'Highly Proficient']
    }
  };

  const normalizeAralToolKey = (val) => {
    if (!val) return 'crla';
    const str = String(val).toLowerCase();
    if (str.includes('phil')) return 'philIri';
    if (str.includes('rma')) return 'rma';
    return 'crla';
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
    let toolKey = null;
    let toolName = null;
    let levelName = null;

    if (aralBasis === 'assessment') {
      toolKey = normalizeAralToolKey(aralToolKey);
      const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
      const selectedLevel = toolObj.levels.includes(aralProfileLevel) ? aralProfileLevel : toolObj.levels[0];
      sectionType = `ARAL_${toolObj.tool}_${selectedLevel.toUpperCase().replace(/ /g, '_')}`;
      sectionName = `ARAL (${toolObj.tool} - ${selectedLevel})`;
      resGrade = 'ARAL';
      toolName = toolObj.tool;
      levelName = selectedLevel;
    }

    addClassSection({
      gradeLevel: resGrade,
      sectionName,
      advisorId: aralTutorId,
      adviserId: aralTutorId,
      tutorId: aralTutorId,
      sectionType,
      numberOfLearners: Number(aralLearners) || 0,
      aralBasis,
      aralGrade: aralBasis === 'grade' ? aralGrade : null,
      aralToolKey: toolKey,
      aralTool: toolName,
      aralProfileLevel: levelName
    });
    setIsModalOpen(false);
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
  const [isManageSubjectsModalOpen, setIsManageSubjectsModalOpen] = useState(false);
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

  // Inline Edit Row state for in-place table & card editing
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingRowData, setEditingRowData] = useState(null);

  const startEditingRow = (sec) => {
    const isAral = String(sec.sectionType || '').startsWith('ARAL') || sec.sectionType === 'ARAL';
    const aralInfo = isAral ? getAralCardDetails(sec) : null;
    const type = sec.sectionType || (String(sec.gradeLevel || '').includes(' - ') ? 'MULTIGRADE' : 'MONO GRADE');

    const cleanGrades = (type === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ')) 
      ? String(sec.gradeLevel || '').split(' - ').map(s => s.trim()).filter(g => Boolean(g) && g !== 'Kinder' && g.toLowerCase() !== 'kinder')
      : [];

    setEditingRowId(sec.id);
    const toolKey = aralInfo ? aralInfo.toolKey : normalizeAralToolKey(sec.aralToolKey || sec.aralTool);
    const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
    const validLevel = (aralInfo && aralInfo.profileLevel && toolObj.levels.includes(aralInfo.profileLevel))
      ? aralInfo.profileLevel
      : (sec.aralProfileLevel && toolObj.levels.includes(sec.aralProfileLevel) ? sec.aralProfileLevel : toolObj.levels[0]);

    setEditingRowId(sec.id);
    setEditingRowData({
      id: sec.id,
      sectionType: type,
      gradeLevel: sec.gradeLevel || availableGrades[0] || 'Grade 7',
      selectedGrades: cleanGrades.length >= 2 ? cleanGrades : [multigradeGrades[0] || 'Grade 1', multigradeGrades[1] || 'Grade 2'],
      sectionName: sec.sectionName || '',
      maleLearners: sec.maleLearners !== undefined && sec.maleLearners !== null ? String(sec.maleLearners) : '',
      femaleLearners: sec.femaleLearners !== undefined && sec.femaleLearners !== null ? String(sec.femaleLearners) : '',
      numberOfLearners: sec.numberOfLearners !== undefined && sec.numberOfLearners !== null ? String(sec.numberOfLearners) : '',
      advisorId: sec.advisorId || sec.adviserId || sec.tutorId || '',
      // ARAL specifics
      aralBasis: aralInfo ? (aralInfo.isAssessment ? 'assessment' : 'grade') : (sec.aralBasis || 'grade'),
      aralGrade: sec.aralGrade || (sec.gradeLevel && sec.gradeLevel !== 'ARAL' && !String(sec.gradeLevel).includes(' - ') ? sec.gradeLevel : 'Grade 3'),
      aralToolKey: toolKey,
      aralProfileLevel: validLevel,
      aralLearners: sec.aralLearners || sec.numberOfLearners || 15,
      tutorId: sec.tutorId || sec.advisorId || sec.adviserId || ''
    });
  };

  const handleSaveInlineEdit = async (sec) => {
    if (!editingRowData) return;

    if (!editingRowData.sectionName.trim()) {
      if (showAlert) await showAlert('Validation Error', 'Please enter a section name.');
      return;
    }

    const isAral = String(sec.sectionType || '').startsWith('ARAL') || sec.sectionType === 'ARAL';
    const isRemedialOrEnrichment = sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT';

    let finalGradeLevel = editingRowData.gradeLevel;
    let finalSectionType = editingRowData.sectionType;
    let toolKey = null;
    let toolObj = null;
    let levelToSave = null;

    if (isAral) {
      if (editingRowData.aralBasis === 'grade') {
        finalGradeLevel = editingRowData.aralGrade;
        finalSectionType = 'ARAL - GRADE LEVEL';
      } else {
        toolKey = normalizeAralToolKey(editingRowData.aralToolKey);
        toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
        levelToSave = toolObj.levels.includes(editingRowData.aralProfileLevel)
          ? editingRowData.aralProfileLevel
          : toolObj.levels[0];
        finalGradeLevel = `${toolObj.tool} - ${levelToSave}`;
        finalSectionType = `ARAL - ${toolObj.tool.toUpperCase()}`;
      }
    } else if (!isRemedialOrEnrichment && finalSectionType === 'MULTIGRADE') {
      const selected = editingRowData.selectedGrades || [];
      if (selected.length < 2 || selected.length > 6) {
        if (showAlert) await showAlert('Validation Error', 'Please select between 2 and 6 grade levels for a multigrade section.');
        return;
      }
      const sortedGrades = [...selected].sort((a, b) => availableGrades.indexOf(a) - availableGrades.indexOf(b));
      finalGradeLevel = sortedGrades.join(' - ');
    }

    // Check duplicate section name within same grade level
    const isDuplicate = classSections.some(s => 
      s.id !== sec.id && 
      s.gradeLevel === finalGradeLevel && 
      s.sectionName.toUpperCase().trim() === editingRowData.sectionName.toUpperCase().trim()
    );

    if (isDuplicate) {
      if (showAlert) await showAlert('Duplicate Section', `A section named "${editingRowData.sectionName.toUpperCase().trim()}" already exists for ${finalGradeLevel}.`);
      return;
    }

    const rawM = String(editingRowData.maleLearners || '').slice(0, 2);
    const rawF = String(editingRowData.femaleLearners || '').slice(0, 2);
    const mVal = rawM === '' ? null : Math.min(99, Math.max(0, Number(rawM)));
    const fVal = rawF === '' ? null : Math.min(99, Math.max(0, Number(rawF)));
    const total = isAral ? Number(editingRowData.aralLearners) : ((mVal || 0) + (fVal || 0));

    const updatedToolKey = isAral ? (toolKey || normalizeAralToolKey(editingRowData.aralToolKey)) : undefined;
    const updatedToolObj = isAral ? (ARAL_TOOLS[updatedToolKey] || ARAL_TOOLS.crla) : undefined;
    const updatedLevel = isAral ? (levelToSave || (updatedToolObj.levels.includes(editingRowData.aralProfileLevel) ? editingRowData.aralProfileLevel : updatedToolObj.levels[0])) : undefined;

    await updateSectionDetails(sec.id, {
      sectionName: editingRowData.sectionName.toUpperCase().trim(),
      gradeLevel: finalGradeLevel,
      sectionType: finalSectionType,
      maleLearners: mVal,
      femaleLearners: fVal,
      numberOfLearners: total,
      aralLearners: isAral ? total : undefined,
      aralBasis: editingRowData.aralBasis,
      aralGrade: editingRowData.aralGrade,
      aralToolKey: updatedToolKey,
      aralTool: isAral ? updatedToolObj.tool : undefined,
      aralProfileLevel: updatedLevel,
      advisorId: editingRowData.advisorId || editingRowData.tutorId,
      adviserId: editingRowData.advisorId || editingRowData.tutorId,
      tutorId: editingRowData.tutorId || editingRowData.advisorId
    });

    if (showToast) showToast(`✓ Section "${editingRowData.sectionName.toUpperCase().trim()}" updated successfully.`);
    setEditingRowId(null);
    setEditingRowData(null);
  };

  const handleCancelInlineEdit = () => {
    setEditingRowId(null);
    setEditingRowData(null);
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

    // Filter by active Special Curricular Programs from School Profile
    baseList = baseList.filter(s => {
      const targetGradeOrBand = s.gradeLevel || (selectedGradeLevel !== 'All' ? selectedGradeLevel : selectedBand);
      return isSpecialProgramSubjectAllowed(s.name, targetGradeOrBand, schoolInfo);
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

  const getSubjectGradeBadge = (sub, band, gradeLevel) => {
    if (sub.gradeLevel && sub.gradeLevel !== 'All') {
      return sub.gradeLevel === 'Kinder' ? 'Kinder' : sub.gradeLevel.replace('Grade ', 'Gr ');
    }
    if (band === 'Elementary') {
      if (gradeLevel !== 'All') {
        return gradeLevel === 'Kinder' ? 'Kinder' : gradeLevel.replace('Grade ', 'Gr ');
      }
      const matching = [];
      if (MASTER_SUBJECTS_CATALOG.Elementary) {
        Object.entries(MASTER_SUBJECTS_CATALOG.Elementary).forEach(([g, list]) => {
          if (Array.isArray(list) && list.includes(sub.name)) {
            matching.push(g);
          }
        });
      }
      if (matching.length === 0) return 'Elem';
      if (matching.length === 1) return matching[0] === 'Kinder' ? 'Kinder' : matching[0].replace('Grade ', 'Gr ');

      const nums = matching
        .map(g => (g === 'Kinder' ? 0 : parseInt(g.replace('Grade ', ''), 10)))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);

      if (nums.length > 0) {
        const min = nums[0] === 0 ? 'K' : `Gr ${nums[0]}`;
        const max = nums[nums.length - 1];
        if (nums[0] === 0 && max === 6) return 'K–6';
        if (nums[0] === 1 && max === 6) return 'Gr 1–6';
        if (nums[0] === 4 && max === 6) return 'Gr 4–6';
        if (nums[0] === 1 && max === 3) return 'Gr 1–3';
        if (nums[0] === 2 && max === 6) return 'Gr 2–6';
        if (nums[0] === 3 && max === 6) return 'Gr 3–6';
        return `${min}–${max}`;
      }
      return 'Elem';
    }

    if (band === 'Junior High School') {
      if (gradeLevel !== 'All') return gradeLevel.replace('Grade ', 'Gr ');
      return 'Gr 7–10';
    }

    if (band === 'Senior High School') {
      if (sub.shsCategory) {
        return sub.shsCategory.replace('SHS-', '').replace(' SUBJECTS', '');
      }
      return 'Gr 11–12';
    }

    return '';
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
    if (!availableGrades.includes('NON-GRADED')) {
      availableGrades.push('NON-GRADED');
    }
  }
  if (showSHS) {
    availableGrades.push('Grade 11', 'Grade 12');
    // Note: NON-GRADED is for Elementary and Junior High only (no NON-GRADED in Senior High).
  }
  if (availableGrades.length === 0) {
    availableGrades.push('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'NON-GRADED', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12');
  }

  const availableBands = [];
  if (showElem) availableBands.push('Elementary');
  if (showJHS) availableBands.push('Junior High School');
  if (showSHS) availableBands.push('Senior High School');
  if (availableBands.length === 0) availableBands.push('Elementary', 'Junior High School', 'Senior High School');

  React.useEffect(() => {
    if (availableBands.length > 0 && !availableBands.includes(selectedBand)) {
      setSelectedBand(availableBands[0]);
    }
  }, [availableBands.join(',')]);

  const multigradeGrades = availableGrades.filter(g => 
    g !== 'Kinder' && 
    g.toLowerCase() !== 'kinder' && 
    g !== 'NON-GRADED' && 
    g !== 'NON GRADED'
  );

  // Auto-cleanup effect for existing saved Multigrade sections that incorrectly contain Kinder
  React.useEffect(() => {
    if (!Array.isArray(classSections) || classSections.length === 0) return;

    let needsUpdate = false;
    const cleanedSections = classSections.map(sec => {
      const isMulti = sec.sectionType === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ');
      if (isMulti && String(sec.gradeLevel || '').includes('Kinder')) {
        const parts = String(sec.gradeLevel).split(' - ').map(p => p.trim()).filter(g => Boolean(g) && g !== 'Kinder' && g.toLowerCase() !== 'kinder');
        const fallbackDefault = multigradeGrades.length >= 2 ? `${multigradeGrades[0]} - ${multigradeGrades[1]}` : 'Grade 1 - Grade 2';
        const newGradeLevel = parts.length >= 2 ? parts.join(' - ') : (parts.length === 1 ? parts[0] : fallbackDefault);
        needsUpdate = true;
        return {
          ...sec,
          gradeLevel: newGradeLevel,
          sectionType: parts.length === 1 ? 'MONO GRADE' : 'MULTIGRADE'
        };
      }
      return sec;
    });

    if (needsUpdate) {
      setClassSections(cleanedSections);
    }
  }, [classSections, multigradeGrades.join(',')]);

  // Auto-clean legacy default 35 values from cached classSections if male/female are unset
  React.useEffect(() => {
    let hasLegacy = false;
    classSections.forEach(sec => {
      if (sec.numberOfLearners === 35 && (!sec.maleLearners || Number(sec.maleLearners) === 0) && (!sec.femaleLearners || Number(sec.femaleLearners) === 0)) {
        hasLegacy = true;
      }
    });
    if (hasLegacy) {
      classSections.forEach(sec => {
        if (sec.numberOfLearners === 35 && (!sec.maleLearners || Number(sec.maleLearners) === 0) && (!sec.femaleLearners || Number(sec.femaleLearners) === 0)) {
          sec.numberOfLearners = null;
          sec.maleLearners = null;
          sec.femaleLearners = null;
          if (sec.id) {
            updateSectionDetails(sec.id, { numberOfLearners: null, maleLearners: null, femaleLearners: null });
          }
        }
      });
    }
  }, [classSections]);

  // Auto-clean legacy/mismatched ARAL tool & profile level data in stored classSections
  React.useEffect(() => {
    let needsUpdate = false;
    classSections.forEach(sec => {
      const isAral = sec.aralBasis === 'assessment' || String(sec.sectionType || '').startsWith('ARAL');
      if (isAral) {
        const toolKey = normalizeAralToolKey(sec.aralToolKey || sec.aralTool || sec.sectionType || sec.gradeLevel || sec.sectionName);
        const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
        if (sec.aralTool !== toolObj.tool || sec.aralToolKey !== toolKey) {
          sec.aralTool = toolObj.tool;
          sec.aralToolKey = toolKey;
          needsUpdate = true;
        }
        if (sec.aralBasis === 'assessment' && (!sec.aralProfileLevel || !toolObj.levels.includes(sec.aralProfileLevel))) {
          sec.aralProfileLevel = toolObj.levels[0];
          needsUpdate = true;
        }
      }
    });
    if (needsUpdate && typeof setClassSections === 'function') {
      setClassSections([...classSections]);
    }
  }, [classSections]);

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
      if (!showElem) {
        await showAlert('Validation Error', 'Multigrade sections are only permitted for Elementary offerings.');
        return;
      }
      if (selectedGrades.length < 2 || selectedGrades.length > 6) {
        await showAlert('Validation Error', 'Please select between 2 and 6 grade levels for a multigrade section.');
        return;
      }
      const invalidGrades = selectedGrades.filter(g => !['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].includes(g));
      if (invalidGrades.length > 0) {
        await showAlert('Validation Error', 'Multigrade sections can only combine Elementary Grades 1 to 6.');
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

  const handleSaveInlineSection = async () => {
    if (!inlineRowData.sectionName.trim()) {
      if (showAlert) await showAlert('Validation Error', 'Please enter a section name.');
      return;
    }
    if (!inlineRowData.advisorId) {
      if (showAlert) await showAlert('Advisory Teacher Required', 'Please select an Advisory Teacher for the section.');
      return;
    }

    let finalGradeLevel = inlineRowData.gradeLevel;
    let finalSectionType = inlineRowData.sectionType || 'MONO GRADE';

    if (finalSectionType === 'MULTIGRADE') {
      const selected = (inlineRowData.selectedGrades || []).filter(g => g !== 'Kinder' && g.toLowerCase() !== 'kinder');
      if (selected.length < 2 || selected.length > 6) {
        if (showAlert) await showAlert('Validation Error', 'Please select between 2 and 6 grade levels (excluding Kinder) for a multigrade section.');
        return;
      }
      const sortedGrades = [...selected].sort((a, b) => availableGrades.indexOf(a) - availableGrades.indexOf(b));
      finalGradeLevel = sortedGrades.join(' - ');
    }

    const isDuplicate = classSections.some(s => 
      s.gradeLevel === finalGradeLevel && 
      s.sectionName.toUpperCase().trim() === inlineRowData.sectionName.toUpperCase().trim()
    );

    if (isDuplicate) {
      if (showAlert) await showAlert('Duplicate Section', `A section named "${inlineRowData.sectionName.toUpperCase().trim()}" already exists for ${finalGradeLevel}.`);
      return;
    }

    const calcMale = inlineRowData.maleLearners !== '' && inlineRowData.maleLearners !== null && inlineRowData.maleLearners !== undefined ? Number(inlineRowData.maleLearners) : null;
    const calcFemale = inlineRowData.femaleLearners !== '' && inlineRowData.femaleLearners !== null && inlineRowData.femaleLearners !== undefined ? Number(inlineRowData.femaleLearners) : null;
    const total = (calcMale || 0) + (calcFemale || 0);

    await addClassSection({
      gradeLevel: finalGradeLevel,
      sectionName: inlineRowData.sectionName.toUpperCase().trim(),
      advisorId: inlineRowData.advisorId,
      sectionType: finalSectionType,
      advisoryMinutes: 300,
      hgpMinutes: 60,
      numberOfLearners: total,
      maleLearners: calcMale,
      femaleLearners: calcFemale
    });

    if (showToast) showToast(`✓ Section "${inlineRowData.sectionName.toUpperCase().trim()}" added successfully.`);

    // Reset inline inputs and prepare next row
    setInlineRowData(prev => ({
      gradeLevel: prev.gradeLevel || availableGrades[0] || 'Grade 7',
      selectedGrades: [],
      sectionName: '',
      maleLearners: '',
      femaleLearners: '',
      advisorId: '',
      sectionType: 'MONO GRADE'
    }));
    setIsInlineAdding(false);
  };

  const getAralCardDetails = (sec) => {
    const isAssessment = sec.aralBasis === 'assessment' || 
      String(sec.sectionType || '').toLowerCase().includes('crla') || 
      String(sec.sectionType || '').toLowerCase().includes('phil') || 
      String(sec.sectionType || '').toLowerCase().includes('rma') || 
      String(sec.gradeLevel || '').toLowerCase().includes('crla') ||
      String(sec.gradeLevel || '').toLowerCase().includes('phil') ||
      String(sec.gradeLevel || '').toLowerCase().includes('rma') ||
      sec.gradeLevel === 'ARAL';

    const basisLabel = isAssessment ? 'Assessment Profile' : 'Grade Level';
    let targetGrade = sec.aralGrade || (sec.gradeLevel && sec.gradeLevel !== 'ARAL' && !String(sec.gradeLevel).includes(' - ') ? sec.gradeLevel : null);
    
    let toolKey = sec.aralToolKey;
    if (!toolKey) {
      if (sec.aralTool) {
        const lower = String(sec.aralTool).toLowerCase();
        if (lower.includes('phil')) toolKey = 'philIri';
        else if (lower.includes('rma')) toolKey = 'rma';
        else toolKey = 'crla';
      } else {
        const text = `${sec.sectionType || ''} ${sec.sectionName || ''} ${sec.gradeLevel || ''}`.toLowerCase();
        if (text.includes('phil')) toolKey = 'philIri';
        else if (text.includes('rma')) toolKey = 'rma';
        else toolKey = 'crla';
      }
    }

    const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
    let toolName = sec.aralTool || toolObj.tool;
    let domainDesc = toolObj.domainDesc;
    let profileLevel = sec.aralProfileLevel;

    if (isAssessment && !profileLevel) {
      if (String(sec.gradeLevel || '').includes(' - ')) {
        profileLevel = String(sec.gradeLevel).split(' - ')[1].trim();
      } else {
        const match = String(sec.sectionName || '').match(/-\s*([^)]+)\)/);
        if (match) {
          profileLevel = match[1].trim();
        } else {
          const parts = String(sec.sectionType || '').split('_');
          if (parts.length >= 3) {
            profileLevel = parts.slice(2).join(' ');
          } else {
            profileLevel = toolObj.levels[0];
          }
        }
      }
    }

    const badgeText = isAssessment
      ? `${toolName} (${domainDesc}) — ${profileLevel || toolObj.levels[0]}`
      : (targetGrade || sec.gradeLevel || '—');

    const learnerCount = (sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '')
      ? Number(sec.numberOfLearners)
      : (Number(sec.aralLearners) || 0);

    const tutorId = sec.advisorId || sec.adviserId || sec.tutorId;
    const tutor = personnel.find(p => String(p.id) === String(tutorId));

    return {
      isAssessment,
      basisLabel,
      targetGrade: targetGrade || sec.gradeLevel || '—',
      toolKey,
      toolName,
      domainDesc,
      profileLevel: profileLevel || toolObj.levels[0],
      badgeText: badgeText || '—',
      learnerCount,
      tutor
    };
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

  // 1. Regular Sections (Mono Grade, Multigrade, Non-graded)
  const regularSections = classSections.filter(sec => 
    sec.sectionType !== 'REMEDIAL' && 
    sec.sectionType !== 'ENRICHMENT' && 
    !String(sec.sectionType || '').startsWith('ARAL') &&
    sec.sectionType !== 'ARAL'
  );

  // 2. ARAL Sections
  const aralSections = classSections.filter(sec => 
    String(sec.sectionType || '').startsWith('ARAL') || sec.sectionType === 'ARAL'
  );

  // 3. Remedial / Enrichment Sections
  const remedialSections = classSections.filter(sec => 
    sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT'
  );

  // Filter regular sections by searchQuery
  const filteredRegularSections = regularSections.filter(sec => {
    const advisor = personnel.find(p => String(p.id) === String(sec.advisorId || sec.adviserId));
    const advisorName = advisor ? `${advisor.firstName} ${advisor.lastName}` : '';
    const hay = `${sec.gradeLevel} ${sec.sectionName} ${sec.sectionType || ''} ${advisorName}`.toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });

  // Filter ARAL sections by searchQuery
  const filteredAralSections = aralSections.filter(sec => {
    const tutor = personnel.find(p => String(p.id) === String(sec.advisorId || sec.adviserId || sec.tutorId));
    const tutorName = tutor ? `${tutor.firstName} ${tutor.lastName}` : '';
    const hay = `${sec.gradeLevel} ${sec.sectionName} ${sec.aralBasis || ''} ${sec.aralTool || ''} ${sec.aralProfileLevel || ''} ${tutorName}`.toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });

  // Filter Remedial/Enrichment sections by searchQuery
  const filteredRemedialSections = remedialSections.filter(sec => {
    const teacher = personnel.find(p => String(p.id) === String(sec.advisorId || sec.adviserId));
    const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : '';
    const hay = `${sec.gradeLevel} ${sec.sectionName} ${sec.sectionType || ''} ${teacherName}`.toLowerCase();
    return hay.includes(searchQuery.toLowerCase());
  });

  return (
    <div style={{ width: '100%' }}>
      <PortalHeader
        title="Organized Classes & Section Setup"
        description="Configure curriculum-level sections, assign class advisers, and manage active subjects offered."
        onBack={() => setActiveView('dashboard')}
        showNodeMap={true}
        onContinue={() => completeNode('classes', 'workload')}
        continueText="Save & Continue to Workload ➔"
      />
      <section id="classes" className="view" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>

      <article className="card" style={{ width: '100%' }}>
        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <h2>Organized Classes Setup</h2>
              <p className="subtext">Configure curriculum-level sections and assign class advisers for the current school year.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                type="button"
                className="btn secondary" 
                onClick={handleClearOrganizedClasses}
                style={{
                  background: '#F8FAFC',
                  color: '#334155',
                  border: '1.5px solid #CBD5E1',
                  fontWeight: '800',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F1F5F9';
                  e.currentTarget.style.color = '#0F172A';
                  e.currentTarget.style.borderColor = '#94A3B8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.color = '#334155';
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }}
                title="Clear all organized class sections in local draft to set up sections manually"
              >
                🗑️ Clear Organized Classes
              </button>
              <button 
                type="button"
                className="btn secondary" 
                onClick={() => setIsManageSubjectsModalOpen(true)}
                style={{
                  background: '#F8FAFC',
                  color: '#1E293B',
                  border: '1.5px solid #CBD5E1',
                  fontWeight: '800',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#EFF6FF';
                  e.currentTarget.style.color = '#1D4ED8';
                  e.currentTarget.style.borderColor = '#93C5FD';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.color = '#1E293B';
                  e.currentTarget.style.borderColor = '#CBD5E1';
                }}
                title="Configure active subjects offered by grade band in your school"
              >
                📚 Manage Subjects Taught
              </button>
            </div>
          </div>

          {/* Total Enrollment Header Cards */}
          {(() => {
            const baseSections = classSections.filter(sec => 
              sec.sectionType !== 'ARAL' && 
              !String(sec.sectionType || '').startsWith('ARAL') &&
              sec.sectionType !== 'REMEDIAL' && 
              sec.sectionType !== 'ENRICHMENT'
            );
            const totalMale = baseSections.reduce((acc, sec) => acc + (Number(sec.maleLearners) || 0), 0);
            const totalFemale = baseSections.reduce((acc, sec) => acc + (Number(sec.femaleLearners) || 0), 0);
            const totalSchool = baseSections.reduce((acc, sec) => {
              const hasGender = (sec.maleLearners !== undefined && sec.maleLearners !== null && sec.maleLearners !== '') ||
                                (sec.femaleLearners !== undefined && sec.femaleLearners !== null && sec.femaleLearners !== '');
              if (hasGender) {
                return acc + (Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0);
              }
              const hasCustom = sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '' && Number(sec.numberOfLearners) !== 35;
              return acc + (hasCustom ? Number(sec.numberOfLearners) : 0);
            }, 0);

            let withinCount = 0;
            let belowCount = 0;
            let aboveCount = 0;

            classSections.forEach(sec => {
              const hasGender = (sec.maleLearners !== undefined && sec.maleLearners !== null && sec.maleLearners !== '') ||
                                (sec.femaleLearners !== undefined && sec.femaleLearners !== null && sec.femaleLearners !== '');
              const total = hasGender 
                ? ((Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0))
                : (sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '' && Number(sec.numberOfLearners) !== 35 ? Number(sec.numberOfLearners) : 0);
              
              const statusObj = getSectionSizeStatus(sec.gradeLevel, total);
              if (statusObj.status === 'WITHIN STANDARD') withinCount++;
              else if (statusObj.status === 'BELOW STANDARD') belowCount++;
              else if (statusObj.status === 'ABOVE STANDARD') aboveCount++;
            });

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', margin: '16px 0 20px 0' }}>
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
                <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL SECTIONS</span>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e293b' }}>{classSections.length} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Sections</span></div>
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
            <div className="table-wrap" style={{ border: '1.5px solid var(--line)', borderRadius: '16px', overflowX: 'auto', background: 'white', marginTop: '16px' }}>
              <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid var(--line)' }}>
                    <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Class Type</th>
                    <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Grade Level</th>
                    <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Section Name</th>
                    <th style={{ padding: '12px 10px', fontSize: '11px', fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '75px' }}>Male (♂)</th>
                    <th style={{ padding: '12px 10px', fontSize: '11px', fontWeight: '800', color: '#be185d', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '75px' }}>Female (♀)</th>
                    <th style={{ padding: '12px 12px', fontSize: '11px', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '90px' }}>Total</th>
                    <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Class Adviser</th>
                    <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '130px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegularSections.map((sec) => {
                    const isEditingThisRow = editingRowId === sec.id;

                    if (isEditingThisRow && editingRowData) {
                      const m = editingRowData.maleLearners !== '' && editingRowData.maleLearners !== null ? Number(editingRowData.maleLearners) : 0;
                      const f = editingRowData.femaleLearners !== '' && editingRowData.femaleLearners !== null ? Number(editingRowData.femaleLearners) : 0;
                      const tot = m + f;
                      const statusObj = getSectionSizeStatus(editingRowData.gradeLevel, tot);

                      return (
                        <tr key={sec.id} style={{ background: '#F0F7FF', borderTop: '2px solid #3B82F6', borderBottom: '2px solid #3B82F6' }}>
                          {/* 1. Class Type Select */}
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                            <select
                              value={editingRowData.sectionType || 'MONO GRADE'}
                              onChange={(e) => {
                                const newType = e.target.value;
                                setEditingRowData(prev => ({
                                  ...prev,
                                  sectionType: newType,
                                  selectedGrades: newType === 'MULTIGRADE' ? ((prev.selectedGrades || []).length > 0 ? prev.selectedGrades : ['Grade 1', 'Grade 2']) : (prev.selectedGrades || [])
                                }));
                              }}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1.5px solid #3B82F6',
                                fontSize: '11px',
                                fontWeight: '800',
                                background: 'white',
                                color: editingRowData.sectionType === 'MULTIGRADE' ? '#B45309' : '#1E293B'
                              }}
                              autoFocus
                            >
                              <option value="MONO GRADE">Mono Grade</option>
                              <option value="MULTIGRADE">Multi Grade</option>
                            </select>
                          </td>

                          {/* 2. Grade Level Field */}
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                            {editingRowData.sectionType === 'MULTIGRADE' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: '#FFFBEB', padding: '6px 8px', borderRadius: '6px', border: '1px solid #FDE68A', minWidth: '160px' }}>
                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#B45309' }}>Select Grades (2-6):</span>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
                                  {multigradeGrades.map(g => {
                                    const isChecked = (editingRowData.selectedGrades || []).includes(g);
                                    return (
                                      <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#78350F', cursor: 'pointer', margin: 0 }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {
                                            let current = (editingRowData.selectedGrades || []).filter(x => x !== 'Kinder' && x.toLowerCase() !== 'kinder');
                                            if (isChecked) {
                                              current = current.filter(x => x !== g);
                                            } else {
                                              if (current.length >= 6) return;
                                              current = [...current, g];
                                            }
                                            setEditingRowData(prev => ({ ...prev, selectedGrades: current }));
                                          }}
                                          style={{ width: '13px', height: '13px', accentColor: '#B45309' }}
                                        />
                                        {g.replace('Grade ', 'G')}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <select
                                value={editingRowData.gradeLevel}
                                onChange={(e) => setEditingRowData(prev => ({ ...prev, gradeLevel: e.target.value }))}
                                style={{
                                  width: '100%',
                                  minWidth: '95px',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  border: '1.5px solid #3B82F6',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  background: 'white'
                                }}
                              >
                                {availableGrades.map(g => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* 3. Section Name Input */}
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                            <input
                              type="text"
                              value={editingRowData.sectionName}
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveInlineEdit(sec);
                                if (e.key === 'Escape') handleCancelInlineEdit();
                              }}
                              style={{
                                width: '100%',
                                minWidth: '130px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1.5px solid #3B82F6',
                                fontSize: '12px',
                                fontWeight: '800',
                                textTransform: 'uppercase',
                                boxSizing: 'border-box',
                                background: 'white'
                              }}
                            />
                          </td>

                          {/* 4. Male Learners */}
                          <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              placeholder="0"
                              value={editingRowData.maleLearners}
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, maleLearners: e.target.value.slice(0, 2) }))}
                              style={{
                                width: '60px',
                                padding: '6px',
                                borderRadius: '6px',
                                border: '1.5px solid #3B82F6',
                                fontSize: '12px',
                                fontWeight: '800',
                                color: '#1D4ED8',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </td>

                          {/* 5. Female Learners */}
                          <td style={{ padding: '10px 8px', verticalAlign: 'middle' }}>
                            <input
                              type="number"
                              min="0"
                              max="99"
                              placeholder="0"
                              value={editingRowData.femaleLearners}
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, femaleLearners: e.target.value.slice(0, 2) }))}
                              style={{
                                width: '60px',
                                padding: '6px',
                                borderRadius: '6px',
                                border: '1.5px solid #3B82F6',
                                fontSize: '12px',
                                fontWeight: '800',
                                color: '#BE185D',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </td>

                          {/* 6. Total Badge */}
                          <td style={{ padding: '10px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '12px',
                              fontWeight: '900',
                              color: '#047857',
                              background: '#DCFCE7',
                              border: '1px solid #BBF7D0',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              display: 'inline-block'
                            }}>
                              {tot}
                            </span>
                          </td>

                          {/* 7. Class Adviser Select */}
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                            <select
                              value={editingRowData.advisorId}
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, advisorId: e.target.value }))}
                              style={{
                                width: '100%',
                                minWidth: '150px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1.5px solid #3B82F6',
                                fontSize: '12px',
                                fontWeight: '700',
                                background: 'white'
                              }}
                            >
                              <option value="">-- Select Adviser --</option>
                              {personnel.map(p => {
                                const assignedCount = classSections.filter(s => s.id !== sec.id && String(s.advisorId || s.adviserId) === String(p.id)).length;
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.firstName} {p.lastName} {assignedCount > 0 ? `(${assignedCount} Sec)` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </td>

                          {/* 8. Actions (Save & Cancel) */}
                          <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(sec)}
                                style={{
                                  background: 'linear-gradient(180deg, #16A34A, #15803D)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  cursor: 'pointer'
                                }}
                              >
                                ✓ Save
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelInlineEdit}
                                style={{
                                  background: '#FEF2F2',
                                  color: '#EF4444',
                                  border: '1px solid #FECACA',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  cursor: 'pointer'
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // Read-only Row
                    const advisor = personnel.find(p => p.id === sec.advisorId);
                    const hasGender = (sec.maleLearners !== undefined && sec.maleLearners !== null && sec.maleLearners !== '') ||
                                      (sec.femaleLearners !== undefined && sec.femaleLearners !== null && sec.femaleLearners !== '');
                    const mVal = Number(sec.maleLearners) || 0;
                    const fVal = Number(sec.femaleLearners) || 0;
                    const totVal = hasGender ? (mVal + fVal) : (sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '' && Number(sec.numberOfLearners) !== 35 ? Number(sec.numberOfLearners) : 0);
                    const hasEnrollment = (mVal > 0 || fVal > 0) || (totVal > 0);
                    const statusObj = getSectionSizeStatus(sec.gradeLevel, totVal);

                    // Grade Badge Color
                    let badgeBg = '#f0f9ff';
                    let badgeColor = '#0369a1';
                    if (String(sec.gradeLevel).toLowerCase().includes('kinder')) {
                      badgeBg = '#fdf2f8';
                      badgeColor = '#be185d';
                    } else if (String(sec.gradeLevel).toLowerCase().includes('grade 11') || String(sec.gradeLevel).toLowerCase().includes('grade 12')) {
                      badgeBg = '#faf5ff';
                      badgeColor = '#6b21a8';
                    }

                    // Class Type / Mono Grade Tag
                    let typeBadgeBg = '#f1f5f9';
                    let typeBadgeColor = '#475569';
                    let typeBadgeBorder = '#cbd5e1';
                    let typeLabel = 'MONO GRADE';

                    if (sec.sectionType === 'MULTIGRADE' || String(sec.gradeLevel || '').includes(' - ')) {
                      typeBadgeBg = '#fffbeb';
                      typeBadgeColor = '#b45309';
                      typeBadgeBorder = '#fde68a';
                      typeLabel = 'MULTIGRADE';
                    } else if (sec.sectionType === 'REMEDIAL') {
                      typeBadgeBg = '#faf5ff';
                      typeBadgeColor = '#7e22ce';
                      typeBadgeBorder = '#e9d5ff';
                      typeLabel = '📘 REMEDIAL';
                    } else if (sec.sectionType === 'ENRICHMENT') {
                      typeBadgeBg = '#eff6ff';
                      typeBadgeColor = '#1d4ed8';
                      typeBadgeBorder = '#bfdbfe';
                      typeLabel = '📙 ENRICHMENT';
                    } else if (String(sec.sectionType || '').startsWith('ARAL')) {
                      typeBadgeBg = '#f0fdf4';
                      typeBadgeColor = '#15803d';
                      typeBadgeBorder = '#bbf7d0';
                      typeLabel = '🎯 ARAL';
                    }

                    const isRowIncomplete = !hasEnrollment || !advisor;

                    return (
                      <tr 
                        key={sec.id}
                        style={{
                          borderBottom: '1px solid #E2E8F0',
                          background: isRowIncomplete ? '#FFFDFD' : 'white',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isRowIncomplete ? '#FEF2F2' : '#F8FAFC';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isRowIncomplete ? '#FFFDFD' : 'white';
                        }}
                      >
                        {/* 1. Class Type */}
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                          <span style={{
                            background: typeBadgeBg,
                            color: typeBadgeColor,
                            border: `1px solid ${typeBadgeBorder}`,
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '10px',
                            fontWeight: '800',
                            letterSpacing: '0.02em',
                            display: 'inline-block',
                            whiteSpace: 'nowrap'
                          }}>
                            {typeLabel}
                          </span>
                        </td>

                        {/* 2. Grade Level */}
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                          {String(sec.gradeLevel || '').includes(' - ') ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {String(sec.gradeLevel).split(' - ').map(g => (
                                <span key={g} style={{
                                  background: '#fffbeb',
                                  color: '#b45309',
                                  border: '1px solid #fde68a',
                                  padding: '3px 8px',
                                  borderRadius: '16px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {g}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{
                              background: badgeBg,
                              color: badgeColor,
                              padding: '4px 10px',
                              borderRadius: '20px',
                              fontSize: '11px',
                              fontWeight: '800',
                              letterSpacing: '0.02em',
                              display: 'inline-block',
                              whiteSpace: 'nowrap'
                            }}>
                              {sec.gradeLevel}
                            </span>
                          )}
                        </td>

                        {/* 3. Section Name */}
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--navy)' }}>
                            {sec.sectionName}
                          </div>
                          {(sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT' || String(sec.sectionType || '').startsWith('ARAL')) && (
                            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600', fontStyle: 'italic', marginTop: '2px' }}>
                              ⓘ Intervention Class
                            </div>
                          )}
                        </td>

                        {/* Male Learners */}
                        <td style={{ padding: '12px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8' }}>
                            {hasGender ? mVal : '—'}
                          </span>
                        </td>

                        {/* Female Learners */}
                        <td style={{ padding: '12px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '800', color: '#be185d' }}>
                            {hasGender ? fVal : '—'}
                          </span>
                        </td>

                        {/* Total Learners */}
                        <td style={{ padding: '12px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          {hasEnrollment ? (
                            <span style={{
                              fontSize: '12px',
                              fontWeight: '900',
                              color: '#047857',
                              background: '#DCFCE7',
                              border: '1px solid #BBF7D0',
                              padding: '3px 9px',
                              borderRadius: '8px',
                              display: 'inline-block',
                              whiteSpace: 'nowrap'
                            }}>
                              {totVal}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: '800',
                              color: '#B91C1C',
                              background: '#FEE2E2',
                              border: '1px solid #FCA5A5',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              display: 'inline-block',
                              whiteSpace: 'nowrap'
                            }}>
                              ⚠ Unset
                            </span>
                          )}
                        </td>

                        {/* Class Adviser */}
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                          {advisor ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '28px',
                                height: '28px',
                                minWidth: '28px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--blue), var(--navy))',
                                color: 'white',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}>
                                {advisor.firstName.charAt(0)}{advisor.lastName.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                                  {advisor.firstName} {advisor.lastName}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600' }}>
                                  {advisor.position || 'Teacher'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span style={{
                              fontSize: '11px',
                              color: '#EF4444',
                              fontStyle: 'italic',
                              fontWeight: '700',
                              background: '#FEF2F2',
                              border: '1px solid #FCA5A5',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap'
                            }}>
                              ⓘ Unassigned Adviser
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => startEditingRow(sec)}
                              disabled={editingRowId !== null && editingRowId !== sec.id}
                              style={{
                                background: '#EFF6FF',
                                color: '#1D4ED8',
                                border: '1px solid #BFDBFE',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                                opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.5 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                              }}
                              title="Edit Section Details"
                            >
                              ✎ Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const confirmed = await showConfirm(
                                  'Remove Section',
                                  `Are you sure you want to remove section "${sec.sectionName}"?`
                                );
                                if (confirmed) {
                                  removeClassSection(sec.id);
                                }
                              }}
                              disabled={editingRowId !== null && editingRowId !== sec.id}
                              style={{
                                background: '#FEF2F2',
                                color: '#EF4444',
                                border: '1px solid #FECACA',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                                opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.5 : 1
                              }}
                              title="Remove Section"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRegularSections.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                        No regular sections found matching your search.
                      </td>
                    </tr>
                  )}

                  {/* Inline Add Section Row */}
                  {!isInlineAdding ? (
                    <tr 
                      onClick={() => {
                        setInlineRowData({
                          gradeLevel: availableGrades[0] || 'Grade 7',
                          selectedGrades: [],
                          sectionName: '',
                          maleLearners: '',
                          femaleLearners: '',
                          advisorId: '',
                          sectionType: 'MONO GRADE'
                        });
                        setIsInlineAdding(true);
                      }}
                      style={{
                        cursor: 'pointer',
                        background: '#FAFCFF',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#EFF6FF';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#FAFCFF';
                      }}
                      title="Click to add a Regular Section inline"
                    >
                      <td colSpan="8" style={{
                        padding: '14px 18px',
                        textAlign: 'center',
                        borderTop: '1.5px dashed #93C5FD',
                        borderBottom: '1.5px dashed #93C5FD',
                        color: '#1D4ED8',
                        fontWeight: '800',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: '#DBEAFE',
                            color: '#1D4ED8',
                            fontSize: '14px',
                            fontWeight: 'bold'
                          }}>+</span>
                          <span>+ Add Section</span>
                          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500', fontStyle: 'italic', marginLeft: '6px' }}>
                            (Click to create a Regular Section inline)
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr style={{ background: '#F0F7FF', borderTop: '2px solid #3B82F6', borderBottom: '2px solid #3B82F6' }}>
                      {/* 1. Class Type Select (Column 1) */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <select
                          value={inlineRowData.sectionType || 'MONO GRADE'}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setInlineRowData(prev => ({
                              ...prev,
                              sectionType: newType,
                              selectedGrades: newType === 'MULTIGRADE' ? ((prev.selectedGrades || []).length > 0 ? prev.selectedGrades : ['Grade 1', 'Grade 2']) : (prev.selectedGrades || [])
                            }));
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1.5px solid #3B82F6',
                            fontSize: '11px',
                            fontWeight: '800',
                            background: 'white',
                            color: inlineRowData.sectionType === 'MULTIGRADE' ? '#B45309' : '#1E293B'
                          }}
                          autoFocus
                        >
                          <option value="MONO GRADE">Mono Grade</option>
                          <option value="MULTIGRADE">Multi Grade</option>
                        </select>
                      </td>

                      {/* 2. Grade Level Field (Column 2: Single select for Mono Grade, Multi-select checkboxes for Multi Grade) */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        {inlineRowData.sectionType === 'MULTIGRADE' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: '#FFFBEB', padding: '6px 8px', borderRadius: '6px', border: '1px solid #FDE68A', minWidth: '160px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#B45309' }}>Select Grades (2-6):</span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
                              {multigradeGrades.map(g => {
                                const isChecked = (inlineRowData.selectedGrades || []).includes(g);
                                return (
                                  <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#78350F', cursor: 'pointer', margin: 0 }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        let current = (inlineRowData.selectedGrades || []).filter(x => x !== 'Kinder' && x.toLowerCase() !== 'kinder');
                                        if (isChecked) {
                                          current = current.filter(x => x !== g);
                                        } else {
                                          if (current.length >= 6) return;
                                          current = [...current, g];
                                        }
                                        setInlineRowData(prev => ({ ...prev, selectedGrades: current }));
                                      }}
                                      style={{ width: '13px', height: '13px', accentColor: '#B45309' }}
                                    />
                                    {g.replace('Grade ', 'G')}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <select
                            value={inlineRowData.gradeLevel}
                            onChange={(e) => setInlineRowData(prev => ({ ...prev, gradeLevel: e.target.value }))}
                            style={{
                              width: '100%',
                              minWidth: '95px',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: '1.5px solid #3B82F6',
                              fontSize: '12px',
                              fontWeight: '700',
                              background: 'white'
                            }}
                          >
                            {availableGrades.map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* 3. Section Name input */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <input
                          type="text"
                          placeholder="SECTION NAME *"
                          value={inlineRowData.sectionName}
                          onChange={(e) => setInlineRowData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveInlineSection();
                            if (e.key === 'Escape') setIsInlineAdding(false);
                          }}
                          style={{
                            width: '100%',
                            minWidth: '130px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1.5px solid #3B82F6',
                            fontSize: '12px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            boxSizing: 'border-box',
                            background: 'white'
                          }}
                        />
                      </td>

                      {/* Male Learners */}
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={inlineRowData.maleLearners}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                            setInlineRowData(prev => ({ ...prev, maleLearners: val }));
                          }}
                          style={{
                            width: '56px',
                            padding: '6px 4px',
                            textAlign: 'center',
                            borderRadius: '6px',
                            border: '1.5px solid #93C5FD',
                            fontSize: '12px',
                            fontWeight: '800',
                            color: '#1D4ED8',
                            background: 'white'
                          }}
                        />
                      </td>

                      {/* Female Learners */}
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={inlineRowData.femaleLearners}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                            setInlineRowData(prev => ({ ...prev, femaleLearners: val }));
                          }}
                          style={{
                            width: '56px',
                            padding: '6px 4px',
                            textAlign: 'center',
                            borderRadius: '6px',
                            border: '1.5px solid #FBCFE8',
                            fontSize: '12px',
                            fontWeight: '800',
                            color: '#BE185D',
                            background: 'white'
                          }}
                        />
                      </td>

                      {/* Total */}
                      <td style={{ padding: '10px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                        {(() => {
                          const m = inlineRowData.maleLearners !== '' ? Number(inlineRowData.maleLearners) : 0;
                          const f = inlineRowData.femaleLearners !== '' ? Number(inlineRowData.femaleLearners) : 0;
                          const tot = m + f;
                          return (
                            <span style={{
                              fontSize: '12px',
                              fontWeight: '900',
                              color: '#047857',
                              background: '#DCFCE7',
                              border: '1px solid #BBF7D0',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              display: 'inline-block',
                              whiteSpace: 'nowrap'
                            }}>
                              {tot}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Adviser select */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <select
                          value={inlineRowData.advisorId}
                          onChange={(e) => setInlineRowData(prev => ({ ...prev, advisorId: e.target.value }))}
                          style={{
                            width: '100%',
                            minWidth: '160px',
                            maxWidth: '220px',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1.5px solid #3B82F6',
                            fontSize: '11px',
                            fontWeight: '700',
                            background: 'white'
                          }}
                        >
                          <option value="">Select Adviser *</option>
                          {teachingPersonnel.map(p => {
                            const assignedSecs = classSections.filter(s => s.advisorId && String(s.advisorId) === String(p.id));
                            const secInfo = assignedSecs.length > 0 ? ` (${assignedSecs.length} assigned)` : '';
                            return (
                              <option key={p.id} value={p.id}>
                                {p.firstName} {p.lastName} · {p.position || 'Teacher'}{secInfo}
                              </option>
                            );
                          })}
                        </select>
                      </td>

                      {/* Actions: Save & Cancel */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={handleSaveInlineSection}
                            style={{
                              background: '#16A34A',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              fontSize: '11px',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)'
                            }}
                            title="Save Section"
                          >
                            ✓ Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsInlineAdding(false)}
                            style={{
                              background: '#F1F5F9',
                              color: '#64748B',
                              border: '1px solid #CBD5E1',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              fontSize: '11px',
                              fontWeight: '800',
                              cursor: 'pointer'
                            }}
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
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
                {filteredRegularSections.map((sec) => {
                  const isEditingThisCard = editingRowId === sec.id;

                  if (isEditingThisCard && editingRowData) {
                    const m = editingRowData.maleLearners !== '' && editingRowData.maleLearners !== null ? Number(editingRowData.maleLearners) : 0;
                    const f = editingRowData.femaleLearners !== '' && editingRowData.femaleLearners !== null ? Number(editingRowData.femaleLearners) : 0;
                    const tot = m + f;

                    return (
                      <div key={sec.id} style={{
                        background: '#F0F7FF',
                        borderRadius: '16px',
                        border: '2px solid #3B82F6',
                        padding: '20px',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#1D4ED8' }}>
                            ✎ Edit Regular Section Setup
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineEdit(sec)}
                              style={{ background: 'linear-gradient(180deg, #16A34A, #15803D)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                            >
                              ✓ Save
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelInlineEdit}
                              style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' }}>Class Type</label>
                          <select
                            value={editingRowData.sectionType || 'MONO GRADE'}
                            onChange={(e) => {
                              const newType = e.target.value;
                              setEditingRowData(prev => ({
                                ...prev,
                                sectionType: newType,
                                selectedGrades: newType === 'MULTIGRADE' ? ((prev.selectedGrades || []).length > 0 ? prev.selectedGrades : ['Grade 1', 'Grade 2']) : (prev.selectedGrades || [])
                              }));
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #3B82F6', fontSize: '12px', fontWeight: '700', background: 'white' }}
                          >
                            <option value="MONO GRADE">Mono Grade</option>
                            <option value="MULTIGRADE">Multi Grade</option>
                          </select>

                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' }}>Grade Level</label>
                          {editingRowData.sectionType === 'MULTIGRADE' ? (
                            <div style={{ background: '#FFFBEB', padding: '8px', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                              <span style={{ fontSize: '10px', fontWeight: '800', color: '#B45309' }}>Select Grades (2-6):</span>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
                                {multigradeGrades.map(g => {
                                  const isChecked = (editingRowData.selectedGrades || []).includes(g);
                                  return (
                                    <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#78350F', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          let current = (editingRowData.selectedGrades || []).filter(x => x !== 'Kinder' && x.toLowerCase() !== 'kinder');
                                          if (isChecked) {
                                            current = current.filter(x => x !== g);
                                          } else {
                                            if (current.length >= 6) return;
                                            current = [...current, g];
                                          }
                                          setEditingRowData(prev => ({ ...prev, selectedGrades: current }));
                                        }}
                                        style={{ width: '13px', height: '13px', accentColor: '#B45309' }}
                                      />
                                      {g}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <select
                              value={editingRowData.gradeLevel}
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, gradeLevel: e.target.value }))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #3B82F6', fontSize: '12px', fontWeight: '700', background: 'white' }}
                            >
                              {availableGrades.map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          )}

                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' }}>Section Name</label>
                          <input
                            type="text"
                            value={editingRowData.sectionName}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #3B82F6', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', background: 'white' }}
                          />

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase' }}>Male (♂)</label>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={editingRowData.maleLearners}
                                onChange={(e) => setEditingRowData(prev => ({ ...prev, maleLearners: e.target.value.slice(0, 2) }))}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #BFDBFE', fontSize: '12px', fontWeight: '800', background: 'white' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: '800', color: '#BE185D', textTransform: 'uppercase' }}>Female (♀)</label>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={editingRowData.femaleLearners}
                                onChange={(e) => setEditingRowData(prev => ({ ...prev, femaleLearners: e.target.value.slice(0, 2) }))}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #FBCFE8', fontSize: '12px', fontWeight: '800', background: 'white' }}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#DCFCE7', padding: '6px 10px', borderRadius: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#047857' }}>Total Learners:</span>
                            <span style={{ fontSize: '12px', fontWeight: '900', color: '#047857' }}>{tot}</span>
                          </div>

                          <label style={{ fontSize: '10px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' }}>Class Adviser</label>
                          <select
                            value={editingRowData.advisorId}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, advisorId: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #3B82F6', fontSize: '12px', fontWeight: '700', background: 'white' }}
                          >
                            <option value="">-- Select Adviser --</option>
                            {personnel.map(p => (
                              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  }

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
                  
                  const hasGender = (sec.maleLearners !== undefined && sec.maleLearners !== null && sec.maleLearners !== '') ||
                                    (sec.femaleLearners !== undefined && sec.femaleLearners !== null && sec.femaleLearners !== '');
                  const mVal = Number(sec.maleLearners) || 0;
                  const fVal = Number(sec.femaleLearners) || 0;
                  const totVal = hasGender ? (mVal + fVal) : (sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '' && Number(sec.numberOfLearners) !== 35 ? Number(sec.numberOfLearners) : 0);
                  const hasEnrollment = (mVal > 0 || fVal > 0) || (totVal > 0);
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
                          onClick={() => startEditingRow(sec)}
                          disabled={editingRowId !== null && editingRowId !== sec.id}
                          style={{
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            border: '1px solid #BFDBFE',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                            opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.5 : 1
                          }}
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
                          const statusObj = getSectionSizeStatus(sec.gradeLevel, totVal);
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
                            background: sec.sectionType === 'REMEDIAL' ? '#FAF5FF' : sec.sectionType === 'ENRICHMENT' ? '#EFF6FF' : sec.sectionType === 'MULTIGRADE' ? '#fffbeb' : String(sec.sectionType).startsWith('ARAL') ? '#F0FDF4' : '#f0fdf4',
                            color: sec.sectionType === 'REMEDIAL' ? '#7E22CE' : sec.sectionType === 'ENRICHMENT' ? '#1D4ED8' : sec.sectionType === 'MULTIGRADE' ? '#b45309' : String(sec.sectionType).startsWith('ARAL') ? '#15803D' : '#15803d',
                            border: sec.sectionType === 'REMEDIAL' ? '1px solid #E9D5FF' : sec.sectionType === 'ENRICHMENT' ? '1px solid #BFDBFE' : sec.sectionType === 'MULTIGRADE' ? '1px solid #FDE68A' : String(sec.sectionType).startsWith('ARAL') ? '1px solid #BBF7D0' : '1px solid #bbf7d0',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase'
                          }}>
                            {sec.sectionType === 'REMEDIAL' ? '📘 REMEDIAL CLASS' : sec.sectionType === 'ENRICHMENT' ? '📙 ENRICHMENT CLASS' : String(sec.sectionType).startsWith('ARAL') ? '🎯 ARAL SECTION' : sec.sectionType}
                          </span>
                        )}
                      </div>

                      {/* Section Title */}
                      <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: '800', color: 'var(--navy)' }}>
                        {sec.sectionName}
                      </h3>

                      {(sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT' || String(sec.sectionType || '').startsWith('ARAL')) && (
                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '700', fontStyle: 'italic', marginTop: '-4px' }}>
                          ⓘ Intervention Class · Not counted in base school enrollment
                        </div>
                      )}

                      {/* Gender Learners & Magic Math Total Read-Only Box */}
                      {(() => {
                        if (!hasEnrollment) {
                          return (
                            <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.7)', borderRadius: '10px', border: '1px solid #FCA5A5', fontSize: '11px', color: '#991B1B', fontWeight: '700', margin: '4px 0' }}>
                              ⓘ No enrollment input. Click Edit Section above.
                            </div>
                          );
                        }

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
              {filteredRegularSections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', border: '1.5px dashed var(--line)', borderRadius: '16px', color: 'var(--muted)', marginTop: '20px' }}>
                  No regular sections found matching your search.
                </div>
              )}
            </>
          )}
        </div>
      </article>

      {/* Dedicated ARAL Sections Article */}
      <article className="card" style={{ width: '100%' }}>
        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🎯</span>
                <h2 style={{ margin: 0 }}>ARAL Sections</h2>
                <span style={{
                  background: '#DCFCE7',
                  color: '#15803D',
                  border: '1px solid #BBF7D0',
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {filteredAralSections.length} {filteredAralSections.length === 1 ? 'Section' : 'Sections'}
                </span>
              </div>
              <p className="subtext" style={{ marginTop: '4px' }}>
                Accelerated learning recovery classes under the Academic Recovery and Accessible Learning (ARAL) Program (RA 12028).
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: '16px' }}>
            <table className="roster-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '145px' }}>1. ARAL Basis</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '195px' }}>2. Target / Assessment Profile</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '140px' }}>3. Profile Level</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>4. Section Name</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '110px' }}>5. Learners</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '190px' }}>6. Section Tutor</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAralSections.map((sec) => {
                  const isEditingThisRow = editingRowId === sec.id;
                  const aralInfo = getAralCardDetails(sec);
                  const tutor = personnel.find(p => String(p.id) === String(sec.advisorId || sec.adviserId || sec.tutorId));

                  if (isEditingThisRow && editingRowData) {
                    return (
                      <tr key={sec.id} style={{ background: '#F0FDF4', borderTop: '2px solid #16A34A', borderBottom: '2px solid #16A34A' }}>
                        {/* 1. ARAL Basis */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <select
                            value={editingRowData.aralBasis}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, aralBasis: e.target.value }))}
                            style={{ padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '800', background: 'white', color: '#15803D' }}
                            autoFocus
                          >
                            <option value="grade">Grade Level Basis</option>
                            <option value="assessment">Assessment Profile Basis</option>
                          </select>
                        </td>

                        {/* 2. Grade Level or Tool Select */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          {editingRowData.aralBasis === 'grade' ? (
                            <select
                              value={editingRowData.aralGrade}
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, aralGrade: e.target.value }))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                            >
                              {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={editingRowData.aralToolKey || 'crla'}
                              onChange={(e) => {
                                const toolKey = e.target.value;
                                const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
                                setEditingRowData(prev => ({
                                  ...prev,
                                  aralToolKey: toolKey,
                                  aralProfileLevel: toolObj.levels[0]
                                }));
                              }}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                            >
                              <option value="crla">CRLA — Reading (Gr 1-3)</option>
                              <option value="philIri">Phil-IRI — Reading (Gr 4-10)</option>
                              <option value="rma">RMA — Math (Gr 1-10)</option>
                            </select>
                          )}
                        </td>

                        {/* 3. Profile Level Select (or Dash for Grade Basis) */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          {editingRowData.aralBasis === 'grade' ? (
                            <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: '700', paddingLeft: '4px' }}>—</span>
                          ) : (
                            <select
                              value={
                                (ARAL_TOOLS[editingRowData.aralToolKey || 'crla'] || ARAL_TOOLS.crla).levels.includes(editingRowData.aralProfileLevel)
                                  ? editingRowData.aralProfileLevel
                                  : (ARAL_TOOLS[editingRowData.aralToolKey || 'crla'] || ARAL_TOOLS.crla).levels[0]
                              }
                              onChange={(e) => setEditingRowData(prev => ({ ...prev, aralProfileLevel: e.target.value }))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                            >
                              {(ARAL_TOOLS[editingRowData.aralToolKey || 'crla'] || ARAL_TOOLS.crla).levels.map(lvl => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* 4. Section Name */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <input
                            type="text"
                            value={editingRowData.sectionName}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(sec); }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}
                          />
                        </td>

                        {/* 5. Learners */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={editingRowData.aralLearners}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, aralLearners: e.target.value.slice(0, 2) }))}
                            style={{ width: '60px', padding: '6px 6px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '12px', fontWeight: '800', textAlign: 'center' }}
                          />
                        </td>

                        {/* 6. Tutor */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <select
                            value={editingRowData.tutorId}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, tutorId: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                          >
                            <option value="">-- Select Tutor --</option>
                            {personnel.map(p => (
                              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                            ))}
                          </select>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineEdit(sec)}
                              style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                            >
                              ✓ Save
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelInlineEdit}
                              style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={sec.id} style={{ borderBottom: '1px solid #E2E8F0', background: 'white' }}>
                      {/* 1. ARAL Basis */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        <span style={{
                          background: '#F0FDF4',
                          color: '#15803D',
                          border: '1px solid #BBF7D0',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '10px',
                          fontWeight: '800',
                          letterSpacing: '0.02em',
                          whiteSpace: 'nowrap'
                        }}>
                          {aralInfo.isAssessment ? '📊 Assessment Profile' : '🎯 Grade Level'}
                        </span>
                      </td>

                      {/* 2. Target / Assessment Profile */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        {aralInfo.isAssessment ? (
                          <span style={{
                            background: '#F0F9FF',
                            color: '#0369A1',
                            border: '1px solid #BAE6FD',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '800',
                            whiteSpace: 'nowrap',
                            display: 'inline-block'
                          }}>
                            ☷ {aralInfo.toolName} — {aralInfo.domainDesc}
                          </span>
                        ) : (
                          <span style={{
                            background: '#F8FAFC',
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            padding: '3px 10px',
                            borderRadius: '16px',
                            fontSize: '11px',
                            fontWeight: '800',
                            whiteSpace: 'nowrap',
                            display: 'inline-block'
                          }}>
                            📚 {aralInfo.targetGrade || sec.gradeLevel || '—'}
                          </span>
                        )}
                      </td>

                      {/* 3. Profile Level */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        {aralInfo.isAssessment ? (
                          <span style={{
                            background: '#FEF3C7',
                            color: '#92400E',
                            border: '1px solid #FDE68A',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: '800',
                            whiteSpace: 'nowrap',
                            display: 'inline-block'
                          }}>
                            📍 {aralInfo.profileLevel}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: '700', paddingLeft: '4px' }}>—</span>
                        )}
                      </td>

                      {/* 4. Section Name */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontWeight: '800', color: 'var(--navy)' }}>
                        {sec.sectionName}
                      </td>

                      {/* 5. Learners */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{
                          background: '#DCFCE7',
                          color: '#15803D',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '800'
                        }}>
                          👥 {sec.aralLearners || sec.numberOfLearners || 15} Learners
                        </span>
                      </td>

                      {/* 6. Tutor */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        {tutor ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: '#16A34A',
                              color: 'white',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: '10px',
                              fontWeight: 'bold'
                            }}>
                              {tutor.firstName.charAt(0)}{tutor.lastName.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--navy)' }}>
                                {tutor.firstName} {tutor.lastName}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{tutor.position || 'Tutor'}</div>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: '700' }}>ⓘ Unassigned Tutor</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => startEditingRow(sec)}
                            disabled={editingRowId !== null && editingRowId !== sec.id}
                            style={{
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: '800',
                              cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                              opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.4 : 1
                            }}
                          >
                            ✎ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSection(sec.id)}
                            disabled={editingRowId !== null && editingRowId !== sec.id}
                            style={{
                              background: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: '800',
                              cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                              opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.4 : 1
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Dashed Inline "+ Add ARAL Section" Row */}
                {isInlineAddingAral ? (
                  <tr style={{ background: '#F0FDF4', borderTop: '2px dashed #16A34A', borderBottom: '2px dashed #16A34A' }}>
                    {/* 1. ARAL Basis */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <select
                        value={inlineAralData.aralBasis}
                        onChange={(e) => setInlineAralData(prev => ({ ...prev, aralBasis: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '800', background: 'white', color: '#15803D' }}
                        autoFocus
                      >
                        <option value="grade">Grade Level Basis</option>
                        <option value="assessment">Assessment Profile Basis</option>
                      </select>
                    </td>

                    {/* 2. Target / Assessment Profile */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      {inlineAralData.aralBasis === 'grade' ? (
                        <select
                          value={inlineAralData.aralGrade}
                          onChange={(e) => setInlineAralData(prev => ({ ...prev, aralGrade: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                        >
                          {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={inlineAralData.aralToolKey || 'crla'}
                          onChange={(e) => {
                            const toolKey = e.target.value;
                            const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
                            setInlineAralData(prev => ({
                              ...prev,
                              aralToolKey: toolKey,
                              aralProfileLevel: toolObj.levels[0]
                            }));
                          }}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                        >
                          <option value="crla">CRLA — Reading (Gr 1-3)</option>
                          <option value="philIri">Phil-IRI — Reading (Gr 4-10)</option>
                          <option value="rma">RMA — Math (Gr 1-10)</option>
                        </select>
                      )}
                    </td>

                    {/* 3. Profile Level */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      {inlineAralData.aralBasis === 'grade' ? (
                        <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: '700', paddingLeft: '4px' }}>—</span>
                      ) : (
                        <select
                          value={inlineAralData.aralProfileLevel}
                          onChange={(e) => setInlineAralData(prev => ({ ...prev, aralProfileLevel: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                        >
                          {(ARAL_TOOLS[inlineAralData.aralToolKey || 'crla'] || ARAL_TOOLS.crla).levels.map(lvl => (
                            <option key={lvl} value={lvl}>{lvl}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 4. Section Name */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <input
                        type="text"
                        placeholder="e.g. ARAL MATH-1"
                        value={inlineAralData.sectionName}
                        onChange={(e) => setInlineAralData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineAralSection(); }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}
                      />
                    </td>

                    {/* 5. Learners */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        placeholder="15"
                        value={inlineAralData.aralLearners}
                        onChange={(e) => setInlineAralData(prev => ({ ...prev, aralLearners: e.target.value.slice(0, 2) }))}
                        style={{ width: '60px', padding: '6px 6px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '12px', fontWeight: '800', textAlign: 'center' }}
                      />
                    </td>

                    {/* 6. Tutor */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <select
                        value={inlineAralData.tutorId}
                        onChange={(e) => setInlineAralData(prev => ({ ...prev, tutorId: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16A34A', fontSize: '11px', fontWeight: '700', background: 'white' }}
                      >
                        <option value="">-- Select Tutor --</option>
                        {personnel.map(p => (
                          <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                        ))}
                      </select>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={handleSaveInlineAralSection}
                          style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          ✓ Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInlineAddingAral(false)}
                          style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    onClick={() => {
                      if (editingRowId !== null) return;
                      setIsInlineAddingAral(true);
                      setInlineAralData({
                        aralBasis: 'grade',
                        aralGrade: 'Grade 3',
                        aralToolKey: 'crla',
                        aralProfileLevel: 'Emerging',
                        sectionName: '',
                        aralLearners: '15',
                        tutorId: ''
                      });
                    }}
                    style={{
                      border: '2px dashed #BBF7D0',
                      background: '#F0FDF4',
                      cursor: editingRowId !== null ? 'not-allowed' : 'pointer',
                      opacity: editingRowId !== null ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (editingRowId === null) e.currentTarget.style.background = '#DCFCE7';
                    }}
                    onMouseLeave={(e) => {
                      if (editingRowId === null) e.currentTarget.style.background = '#F0FDF4';
                    }}
                  >
                    <td colSpan="7" style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#15803D', fontWeight: '800', fontSize: '13px' }}>
                        <span style={{ fontSize: '16px' }}>+</span> Add ARAL Section
                        <span style={{ fontSize: '11px', color: '#166534', fontWeight: '600' }}>(Click to create an ARAL Section inline)</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredAralSections.length === 0 && !isInlineAddingAral && (
            <div style={{
              textAlign: 'center',
              padding: '24px 16px',
              border: '1.5px dashed #CBD5E1',
              borderRadius: '12px',
              color: 'var(--muted)',
              marginTop: '16px',
              background: '#F8FAFC'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>🎯</div>
              <div style={{ fontWeight: '800', color: 'var(--navy)', fontSize: '14px', marginBottom: '2px' }}>
                No ARAL Sections Configured
              </div>
              <p style={{ fontSize: '11px', margin: 0, color: 'var(--muted)' }}>
                Organize reading and mathematics catch-up classes using either Grade Level or Assessment Profile standards. Click "+ Add ARAL Section" in the table row below.
              </p>
            </div>
          )}
        </div>
      </article>

      {/* Dedicated Remedial / Enrichment Sections Article */}
      <article className="card" style={{ width: '100%' }}>
        <div className="card-inner">
          <div className="roster-card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📘</span>
                <h2 style={{ margin: 0 }}>Remedial / Enrichment Sections</h2>
                <span style={{
                  background: '#F3E8FF',
                  color: '#7E22CE',
                  border: '1px solid #E9D5FF',
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {filteredRemedialSections.length} {filteredRemedialSections.length === 1 ? 'Section' : 'Sections'}
                </span>
              </div>
              <p className="subtext" style={{ marginTop: '4px' }}>
                Targeted intervention and advanced enhancement classes outside standard curriculum hours.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '700', fontStyle: 'italic' }}>
                  ⓘ Note: Remedial/Enrichment learners are recorded for intervention and are NOT added to base school enrollment.
                </div>
                <div style={{ fontSize: '11px', color: '#7E22CE', fontWeight: '700', fontStyle: 'italic' }}>
                  ⚡ Assigning a teacher automatically adds a REMEDIATION / ENRICHMENT teaching load row into their Workload timetable.
                </div>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: '16px' }}>
            <table className="roster-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '195px' }}>1. Intervention Category</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '145px' }}>2. Target Grade</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>3. Section Name</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '80px' }}>4. Male</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '80px' }}>5. Female</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '80px' }}>6. Total</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '200px' }}>7. Assigned Teacher</th>
                  <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRemedialSections.map((sec) => {
                  const isEditingThisRow = editingRowId === sec.id;
                  const isRemedial = sec.sectionType === 'REMEDIAL';
                  const teacher = personnel.find(p => String(p.id) === String(sec.advisorId || sec.adviserId));
                  const mVal = Number(sec.maleLearners) || 0;
                  const fVal = Number(sec.femaleLearners) || 0;
                  const totVal = (sec.numberOfLearners !== undefined && sec.numberOfLearners !== null && sec.numberOfLearners !== '')
                    ? Number(sec.numberOfLearners)
                    : (mVal + fVal);

                  if (isEditingThisRow && editingRowData) {
                    const editM = Number(editingRowData.maleLearners) || 0;
                    const editF = Number(editingRowData.femaleLearners) || 0;
                    const editTot = editM + editF;

                    return (
                      <tr key={sec.id} style={{ background: '#FAF5FF', borderTop: '2px solid #9333EA', borderBottom: '2px solid #9333EA' }}>
                        {/* 1. Category */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <select
                            value={editingRowData.sectionType || 'REMEDIAL'}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, sectionType: e.target.value }))}
                            style={{ padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '11px', fontWeight: '800', background: 'white', color: '#7E22CE' }}
                            autoFocus
                          >
                            <option value="REMEDIAL">📘 Remedial Class</option>
                            <option value="ENRICHMENT">📙 Enrichment Class</option>
                          </select>
                        </td>

                        {/* 2. Target Grade */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <select
                            value={editingRowData.gradeLevel}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, gradeLevel: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '11px', fontWeight: '700', background: 'white' }}
                          >
                            {availableGrades.map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        </td>

                        {/* 3. Section Name */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <input
                            type="text"
                            value={editingRowData.sectionName}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineEdit(sec); }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}
                          />
                        </td>

                        {/* 4. Male */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="99"
                            value={editingRowData.maleLearners}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, maleLearners: e.target.value.slice(0, 2) }))}
                            style={{ width: '50px', padding: '6px 4px', borderRadius: '6px', border: '1.5px solid #BFDBFE', fontSize: '12px', fontWeight: '800', textAlign: 'center' }}
                          />
                        </td>

                        {/* 5. Female */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="99"
                            value={editingRowData.femaleLearners}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, femaleLearners: e.target.value.slice(0, 2) }))}
                            style={{ width: '50px', padding: '6px 4px', borderRadius: '6px', border: '1.5px solid #FBCFE8', fontSize: '12px', fontWeight: '800', textAlign: 'center' }}
                          />
                        </td>

                        {/* 6. Total */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '800' }}>
                            {editTot}
                          </span>
                        </td>

                        {/* 7. Assigned Teacher */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          <select
                            value={editingRowData.advisorId}
                            onChange={(e) => setEditingRowData(prev => ({ ...prev, advisorId: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '11px', fontWeight: '700', background: 'white' }}
                          >
                            <option value="">-- Select Teacher --</option>
                            {personnel.map(p => (
                              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                            ))}
                          </select>
                        </td>

                        {/* 8. Actions */}
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineEdit(sec)}
                              style={{ background: '#9333EA', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                            >
                              ✓ Save
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelInlineEdit}
                              style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={sec.id} style={{ borderBottom: '1px solid #E2E8F0', background: 'white' }}>
                      {/* 1. Intervention Category */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        <span style={{
                          background: isRemedial ? '#FAF5FF' : '#EFF6FF',
                          color: isRemedial ? '#7E22CE' : '#1D4ED8',
                          border: `1px solid ${isRemedial ? '#E9D5FF' : '#BFDBFE'}`,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '10px',
                          fontWeight: '800',
                          letterSpacing: '0.02em',
                          whiteSpace: 'nowrap'
                        }}>
                          {isRemedial ? '📘 REMEDIAL CLASS' : '📙 ENRICHMENT CLASS'}
                        </span>
                      </td>

                      {/* 2. Target Grade */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        <span style={{
                          background: '#F8FAFC',
                          color: '#475569',
                          border: '1px solid #CBD5E1',
                          padding: '3px 8px',
                          borderRadius: '16px',
                          fontSize: '11px',
                          fontWeight: '800',
                          whiteSpace: 'nowrap'
                        }}>
                          Target: {sec.gradeLevel}
                        </span>
                      </td>

                      {/* 3. Section Name */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontWeight: '800', color: 'var(--navy)' }}>
                        {sec.sectionName}
                      </td>

                      {/* 4. Male */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center', color: '#1D4ED8', fontWeight: '800' }}>
                        {mVal > 0 ? `♂ ${mVal}` : '—'}
                      </td>

                      {/* 5. Female */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center', color: '#BE185D', fontWeight: '800' }}>
                        {fVal > 0 ? `♀ ${fVal}` : '—'}
                      </td>

                      {/* 6. Total */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '800' }}>
                          {totVal}
                        </span>
                      </td>

                      {/* 7. Assigned Teacher */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        {teacher ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: isRemedial ? '#7E22CE' : '#1D4ED8',
                              color: 'white',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: '10px',
                              fontWeight: 'bold'
                            }}>
                              {teacher.firstName.charAt(0)}{teacher.lastName.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--navy)' }}>
                                {teacher.firstName} {teacher.lastName}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{teacher.position || 'Teacher'}</div>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: '700' }}>ⓘ Unassigned Teacher</span>
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => startEditingRow(sec)}
                            disabled={editingRowId !== null && editingRowId !== sec.id}
                            style={{
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: '800',
                              cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                              opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.4 : 1
                            }}
                          >
                            ✎ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSection(sec.id)}
                            disabled={editingRowId !== null && editingRowId !== sec.id}
                            style={{
                              background: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: '800',
                              cursor: (editingRowId !== null && editingRowId !== sec.id) ? 'not-allowed' : 'pointer',
                              opacity: (editingRowId !== null && editingRowId !== sec.id) ? 0.4 : 1
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Dashed Inline "+ Add Remedial / Enrichment Section" Row */}
                {isInlineAddingRemedial ? (
                  <tr style={{ background: '#FAF5FF', borderTop: '2px dashed #9333EA', borderBottom: '2px dashed #9333EA' }}>
                    {/* 1. Category */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <select
                        value={inlineRemedialData.sectionType}
                        onChange={(e) => setInlineRemedialData(prev => ({ ...prev, sectionType: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '11px', fontWeight: '800', background: 'white', color: '#7E22CE' }}
                        autoFocus
                      >
                        <option value="REMEDIAL">📘 Remedial Class</option>
                        <option value="ENRICHMENT">📙 Enrichment Class</option>
                      </select>
                    </td>

                    {/* 2. Target Grade */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <select
                        value={inlineRemedialData.gradeLevel}
                        onChange={(e) => setInlineRemedialData(prev => ({ ...prev, gradeLevel: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '11px', fontWeight: '700', background: 'white' }}
                      >
                        {availableGrades.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </td>

                    {/* 3. Section Name */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <input
                        type="text"
                        placeholder="e.g. REMEDIAL MATH-3"
                        value={inlineRemedialData.sectionName}
                        onChange={(e) => setInlineRemedialData(prev => ({ ...prev, sectionName: e.target.value.toUpperCase() }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInlineRemedialSection(); }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}
                      />
                    </td>

                    {/* 4. Male */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        placeholder="0"
                        value={inlineRemedialData.maleLearners}
                        onChange={(e) => setInlineRemedialData(prev => ({ ...prev, maleLearners: e.target.value.slice(0, 2) }))}
                        style={{ width: '50px', padding: '6px 4px', borderRadius: '6px', border: '1.5px solid #BFDBFE', fontSize: '12px', fontWeight: '800', textAlign: 'center' }}
                      />
                    </td>

                    {/* 5. Female */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        placeholder="0"
                        value={inlineRemedialData.femaleLearners}
                        onChange={(e) => setInlineRemedialData(prev => ({ ...prev, femaleLearners: e.target.value.slice(0, 2) }))}
                        style={{ width: '50px', padding: '6px 4px', borderRadius: '6px', border: '1.5px solid #FBCFE8', fontSize: '12px', fontWeight: '800', textAlign: 'center' }}
                      />
                    </td>

                    {/* 6. Total */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '800' }}>
                        {(Number(inlineRemedialData.maleLearners) || 0) + (Number(inlineRemedialData.femaleLearners) || 0)}
                      </span>
                    </td>

                    {/* 7. Assigned Teacher */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                      <select
                        value={inlineRemedialData.advisorId}
                        onChange={(e) => setInlineRemedialData(prev => ({ ...prev, advisorId: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #9333EA', fontSize: '11px', fontWeight: '700', background: 'white' }}
                      >
                        <option value="">-- Select Teacher --</option>
                        {personnel.map(p => (
                          <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                        ))}
                      </select>
                    </td>

                    {/* 8. Actions */}
                    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={handleSaveInlineRemedialSection}
                          style={{ background: '#9333EA', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          ✓ Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInlineAddingRemedial(false)}
                          style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    onClick={() => {
                      if (editingRowId !== null) return;
                      setIsInlineAddingRemedial(true);
                      setInlineRemedialData({
                        sectionType: 'REMEDIAL',
                        gradeLevel: availableGrades[0] || 'Grade 3',
                        sectionName: '',
                        maleLearners: '',
                        femaleLearners: '',
                        advisorId: ''
                      });
                    }}
                    style={{
                      border: '2px dashed #E9D5FF',
                      background: '#FAF5FF',
                      cursor: editingRowId !== null ? 'not-allowed' : 'pointer',
                      opacity: editingRowId !== null ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (editingRowId === null) e.currentTarget.style.background = '#F3E8FF';
                    }}
                    onMouseLeave={(e) => {
                      if (editingRowId === null) e.currentTarget.style.background = '#FAF5FF';
                    }}
                  >
                    <td colSpan="8" style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#7E22CE', fontWeight: '800', fontSize: '13px' }}>
                        <span style={{ fontSize: '16px' }}>+</span> Add Remedial / Enrichment Section
                        <span style={{ fontSize: '11px', color: '#6B21A8', fontWeight: '600' }}>(Click to create a Remedial/Enrichment Section inline)</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredRemedialSections.length === 0 && !isInlineAddingRemedial && (
            <div style={{
              textAlign: 'center',
              padding: '24px 16px',
              border: '1.5px dashed #CBD5E1',
              borderRadius: '12px',
              color: 'var(--muted)',
              marginTop: '16px',
              background: '#F8FAFC'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>📘</div>
              <div style={{ fontWeight: '800', color: 'var(--navy)', fontSize: '14px', marginBottom: '2px' }}>
                No Remedial or Enrichment Sections Configured
              </div>
              <p style={{ fontSize: '11px', margin: 0, color: 'var(--muted)' }}>
                Targeted intervention and advanced enhancement classes outside standard curriculum hours. Click "+ Add Remedial / Enrichment Section" in the table row below.
              </p>
            </div>
          )}
        </div>
      </article>



      {/* Unified Add Section Modal Popup */}
      {isModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ width: '580px', maxWidth: '95vw', padding: '28px 24px', background: 'white', borderRadius: '24px', border: '2.5px solid var(--outline)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'scaleUp 0.2s forwards' }}>
            <div className="modal-head" style={{ border: 0, padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '22px', margin: 0, color: 'var(--navy)', fontWeight: 800 }}>Add Section</h2>
                <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Choose a section category, configure learners, and assign teaching personnel.</p>
              </div>
              <button className="btn secondary" onClick={() => setIsModalOpen(false)} style={{ borderRadius: '50%', width: '36px', height: '36px', minWidth: '36px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}>&times;</button>
            </div>

            {/* 3 Section Category Selector Tabs */}
            <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '12px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setModalCategory('REGULAR')}
                style={{
                  flex: 1,
                  padding: '9px 10px',
                  borderRadius: '9px',
                  border: 'none',
                  background: modalCategory === 'REGULAR' ? 'white' : 'transparent',
                  color: modalCategory === 'REGULAR' ? 'var(--navy)' : '#64748B',
                  fontWeight: '800',
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: modalCategory === 'REGULAR' ? '0 2px 5px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                🏫 Regular Section
              </button>
              <button
                type="button"
                onClick={() => setModalCategory('ARAL')}
                style={{
                  flex: 1,
                  padding: '9px 10px',
                  borderRadius: '9px',
                  border: 'none',
                  background: modalCategory === 'ARAL' ? 'white' : 'transparent',
                  color: modalCategory === 'ARAL' ? '#16A34A' : '#64748B',
                  fontWeight: '800',
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: modalCategory === 'ARAL' ? '0 2px 5px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                🎯 ARAL Section
              </button>
              <button
                type="button"
                onClick={() => setModalCategory('REMEDIAL_ENRICHMENT')}
                style={{
                  flex: 1,
                  padding: '9px 10px',
                  borderRadius: '9px',
                  border: 'none',
                  background: modalCategory === 'REMEDIAL_ENRICHMENT' ? 'white' : 'transparent',
                  color: modalCategory === 'REMEDIAL_ENRICHMENT' ? '#9333EA' : '#64748B',
                  fontWeight: '800',
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: modalCategory === 'REMEDIAL_ENRICHMENT' ? '0 2px 5px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                📘 Remedial / Enrichment
              </button>
            </div>

            {/* TAB 1: REGULAR SECTION FORM */}
            {modalCategory === 'REGULAR' && (
              <form onSubmit={handleAddSubmit} style={{ display: 'grid', gap: '20px' }}>
                <div style={{ display: 'grid', gap: '15px', borderBottom: '1.5px solid var(--line)', paddingBottom: '20px' }}>
                  {showElem && (
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
                        THIS IS A MULTIGRADE SECTION (ELEMENTARY GRADES 1–6)
                      </label>
                    </div>
                  )}
                  {showElem && isMultigrade ? (
                    <div className="full" style={{ marginBottom: '15px' }}>
                      <label style={{ fontWeight: 'bold', fontSize: '12px' }}>SELECT GRADE LEVELS (2 TO 6 COMBINATIONS)</label>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: 'var(--blue-50, #F0F9FF)', padding: '12px', borderRadius: '12px', border: '1.5px solid var(--line, #BAE6FD)', marginTop: '8px' }}>
                        {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].map((g) => {
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
            )}

            {/* TAB 2: ARAL SECTION FORM */}
            {modalCategory === 'ARAL' && (
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
                      {availableGrades.map(g => (
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
                  <button type="button" className="btn secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#16A34A', color: 'white', fontWeight: '800', cursor: 'pointer', fontSize: '13px' }}>Create ARAL Section</button>
                </div>
              </form>
            )}

            {/* TAB 3: REMEDIAL / ENRICHMENT SECTION FORM */}
            {modalCategory === 'REMEDIAL_ENRICHMENT' && (
              <form onSubmit={handleRemedialSubmit} style={{ display: 'grid', gap: '16px' }}>
                {/* Mode Selector: REMEDIAL vs ENRICHMENT */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '6px' }}>Intervention Category</label>
                  <div style={{ display: 'flex', background: '#F1F5F9', border: '1.5px solid #CBD5E1', borderRadius: '12px', padding: '3px', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setRemedialType('REMEDIAL')}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '9px',
                        border: 'none',
                        background: remedialType === 'REMEDIAL' ? '#9333EA' : 'transparent',
                        color: remedialType === 'REMEDIAL' ? 'white' : '#475569',
                        fontWeight: '800',
                        fontSize: '12px',
                        cursor: 'pointer',
                        boxShadow: remedialType === 'REMEDIAL' ? '0 2px 6px rgba(147, 51, 234, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      📘 Remedial Class (Catch-Up / Intervention)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemedialType('ENRICHMENT')}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '9px',
                        border: 'none',
                        background: remedialType === 'ENRICHMENT' ? '#2563EB' : 'transparent',
                        color: remedialType === 'ENRICHMENT' ? 'white' : '#475569',
                        fontWeight: '800',
                        fontSize: '12px',
                        cursor: 'pointer',
                        boxShadow: remedialType === 'ENRICHMENT' ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      📙 Enrichment Class (Advanced / Enhancement)
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>Target Grade Level</label>
                  <select
                    value={remedialGrade}
                    onChange={(e) => setRemedialGrade(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                  >
                    {availableGrades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>Section Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    placeholder={remedialType === 'REMEDIAL' ? 'e.g. READING REMEDIATION GROUP A' : 'e.g. ADVANCED MATH ENRICHMENT B'}
                    value={remedialSectionName}
                    onChange={(e) => setRemedialSectionName(e.target.value.toUpperCase())}
                    required
                    style={{ width: '100%', textTransform: 'uppercase', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Male and Female Learners */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', background: '#F8FAFC', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '14px' }}>♂</span> Male Learners
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={remedialMale}
                      onChange={(e) => setRemedialMale(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
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
                      value={remedialFemale}
                      onChange={(e) => setRemedialFemale(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
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
                      placeholder="0"
                      value={(Number(remedialMale) || 0) + (Number(remedialFemale) || 0)}
                      style={{ background: '#f1f5f9', fontWeight: '800', color: '#047857', border: '1.5px solid #a7f3d0' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1', fontSize: '10px', color: '#64748B', fontWeight: '600', fontStyle: 'italic', textAlign: 'center' }}>
                    ⓘ Note: Remedial/Enrichment learners are recorded for intervention and are <strong>NOT added</strong> to base school enrollment.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>Assigned Teacher</label>
                  <select
                    value={remedialTeacherId}
                    onChange={(e) => setRemedialTeacherId(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                  >
                    <option value="">No teacher assigned yet</option>
                    {teachingPersonnel.map((p) => {
                      return (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} · {p.position}
                        </option>
                      );
                    })}
                  </select>
                  <span style={{ fontSize: '10px', color: '#7E22CE', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                    ⚡ Assigning a teacher automatically adds a {remedialType === 'REMEDIAL' ? 'REMEDIATION' : 'ENRICHMENT'} teaching load row into their Workload timetable.
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                  <button className="btn secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button className="btn" type="submit" style={{ background: remedialType === 'REMEDIAL' ? 'linear-gradient(180deg, #9333EA, #6B21A8)' : 'linear-gradient(180deg, #2563EB, #1D4ED8)', color: 'white', fontWeight: '800' }}>
                    Create {remedialType === 'REMEDIAL' ? 'Remedial' : 'Enrichment'} Section
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Manage Subjects Taught Modal Popup */}
      {isManageSubjectsModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(5px)', zIndex: 1000, position: 'fixed', inset: 0, padding: '16px' }}>
          <div className="modal-card" style={{ width: '680px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px 28px', background: 'white', borderRadius: '24px', border: '2.5px solid var(--outline)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'scaleUp 0.2s forwards', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div className="modal-head" style={{ border: 0, padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexShrink: 0 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '22px' }}>📚</span>
                  <h2 style={{ fontSize: '22px', margin: 0, color: 'var(--navy)', fontWeight: 800 }}>Subjects Taught</h2>
                </div>
                <p className="subtext" style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                  Configure active subjects offered by grade band in your school. Toggled subjects instantly update in local drafts.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setNewSubjectInput('');
                    setIsSubjectModalOpen(true);
                  }}
                  style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', minHeight: '34px', padding: '0 12px', borderRadius: '8px', fontWeight: '800' }}
                >
                  + Add Subject
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsManageSubjectsModalOpen(false)}
                  style={{ borderRadius: '50%', width: '34px', height: '34px', minWidth: '34px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Grade Band Selector Tabs */}
            <div style={{ flexShrink: 0, marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', marginBottom: '12px' }}>
                {availableBands.map(band => (
                  <button
                    key={band}
                    type="button"
                    onClick={() => {
                      setSelectedBand(band);
                      setSelectedGradeLevel('All');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontWeight: selectedBand === band ? '800' : '600',
                      borderRadius: '8px',
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Subject Search Bar */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search subject..."
                    value={subjectSearchQuery}
                    onChange={(e) => setSubjectSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--line)',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'var(--navy)',
                      background: 'white'
                    }}
                  />
                </div>

                {/* Grade Level Dropdown Filter */}
                <div style={{ minWidth: '130px' }}>
                  <select
                    value={selectedGradeLevel}
                    onChange={(e) => setSelectedGradeLevel(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', background: 'white' }}
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
                        <option value="NON-GRADED">NON-GRADED</option>
                      </>
                    )}
                    {selectedBand === 'Junior High School' && (
                      <>
                        <option value="Grade 7">Grade 7</option>
                        <option value="Grade 8">Grade 8</option>
                        <option value="Grade 9">Grade 9</option>
                        <option value="Grade 10">Grade 10</option>
                        <option value="NON-GRADED">NON-GRADED</option>
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
                  <div style={{ minWidth: '150px' }}>
                    <select
                      value={selectedShsFilterCategory}
                      onChange={(e) => setSelectedShsFilterCategory(e.target.value)}
                      style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '8px', border: '1.5px solid var(--line)', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', background: 'white' }}
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
            {(() => {
              const displayedSubs = getSubjectsForView();
              const activeCount = displayedSubs.filter(s => s.enabled).length;
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px 0', padding: '4px 2px', flexShrink: 0, borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--navy)' }}>
                      {displayedSubs.length} Subjects
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: '12px' }}>
                      {activeCount} Active
                    </span>
                  </div>
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
              );
            })()}

            {/* Compact 2-Column Grid of Subjects with Checkboxes & Grade Badges */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '6px 10px',
              overflowY: 'auto',
              flex: 1,
              paddingRight: '4px',
              minHeight: '200px',
              alignContent: 'start'
            }}>
              {getSubjectsForView().map((sub, index) => {
                const badgeText = getSubjectGradeBadge(sub, selectedBand, selectedGradeLevel);
                return (
                  <div
                    key={sub.name || index}
                    onClick={() => toggleSubject(sub.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: sub.enabled ? '1.5px solid #BBF7D0' : '1px solid #E2E8F0',
                      background: sub.enabled ? '#ffffff' : '#FAFAFA',
                      opacity: sub.enabled ? 1 : 0.65,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'all 0.15s ease',
                      minHeight: '34px',
                      boxSizing: 'border-box'
                    }}
                  >
                    {/* Left: Checkbox & Subject Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={sub.enabled}
                        onChange={() => toggleSubject(sub.name)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '15px',
                          height: '15px',
                          minWidth: '15px',
                          cursor: 'pointer',
                          accentColor: '#16A34A',
                          margin: 0
                        }}
                      />
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: sub.enabled ? 'var(--navy)' : '#64748B',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }} title={sub.name}>
                        {sub.name}
                      </span>
                    </div>

                    {/* Right: Grade-level tag / badge */}
                    {badgeText && (
                      <span style={{
                        fontSize: '9px',
                        fontWeight: '800',
                        padding: '1.5px 6px',
                        borderRadius: '4px',
                        background: sub.enabled ? '#DCFCE7' : '#F1F5F9',
                        color: sub.enabled ? '#15803D' : '#64748B',
                        border: `1px solid ${sub.enabled ? '#86EFAC' : '#CBD5E1'}`,
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        {badgeText}
                      </span>
                    )}
                  </div>
                );
              })}
              {getSubjectsForView().length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px', color: 'var(--muted)', fontSize: '12px', border: '1.5px dashed var(--line)', borderRadius: '12px' }}>
                  No subjects found matching your filter criteria.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', marginTop: '12px', borderTop: '1.5px solid var(--line)', flexShrink: 0 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setIsManageSubjectsModalOpen(false)}
                style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontWeight: '800', minHeight: '38px', padding: '0 24px', borderRadius: '10px', fontSize: '13px' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subject Modal Popup */}
      {isSubjectModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
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



    </section>
    </div>
  );
}

