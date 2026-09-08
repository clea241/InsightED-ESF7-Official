import React, { useState, useMemo } from 'react';
import { useApp, isSpecialProgramSubjectAllowed } from '../context/AppContext';
import PortalHeader from '../components/PortalHeader';
import SortableTableHead from '../components/SortableTableHead';
import useSortableFilterableTable from '../hooks/useSortableFilterableTable';
import { FiGrid, FiBookOpen, FiBook, FiUsers, FiTrash2, FiCheck, FiX, FiTarget, FiEdit2, FiSearch, FiLayers, FiTag, FiAlertCircle, FiBookmark } from 'react-icons/fi';


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
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
      'EPP/TLE', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 5': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
      'EPP/TLE', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 6': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
      'EPP/TLE', 'SPECIAL PROGRAM IN SCIENCE',
      'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
      'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'SNED': [
      'SPED MODIFIED SUBJECTS'
    ],
    'ALS': [
      'ALS LEARNING STRAND', 'COMMUNICATION SKILLS (ENGLISH)', 'COMMUNICATION SKILLS (FILIPINO)',
      'SCIENTIFIC AND CRITICAL THINKING SKILLS', 'MATHEMATICAL AND PROBLEM SOLVING SKILLS',
      'LIFE AND CAREER SKILLS', 'UNDERSTANDING THE SELF AND SOCIETY', 'DIGITAL CITIZENSHIP'
    ]
  },
  'Junior High School': {
    'All': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
      'EPP/TLE',
      'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
      'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
      'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
      'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
      'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING',
      'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 7': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
      'EPP/TLE',
      'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
      'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
      'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
      'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
      'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING',
      'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 8': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
      'EPP/TLE',
      'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
      'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
      'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
      'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
      'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING',
      'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 9': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
      'EPP/TLE',
      'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
      'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
      'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
      'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
      'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
      'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING',
      'ARAL - MATH', 'ARAL - SCIENCE'
    ],
    'Grade 10': [
      'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
      'EPP/TLE',
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
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
    'EPP/TLE', 'EPP / TLE', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 5': [
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
    'EPP/TLE', 'EPP / TLE', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 6': [
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'GMRC',
    'EPP/TLE', 'EPP / TLE', 'SPECIAL PROGRAM IN SCIENCE',
    'SPED MODIFIED SUBJECTS', 'IP RELATED SUBJECT', 'MADRASAH SUBJECTS',
    'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 7': [
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
    'EPP/TLE', 'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
    'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
    'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 8': [
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
    'EPP/TLE', 'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
    'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
    'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 9': [
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
    'EPP/TLE', 'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
    'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
    'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'Grade 10': [
    'TLE', 'MAPEH', 'ARALING PANLIPUNAN', 'FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'VALUES EDUCATION',
    'EPP/TLE', 'SPECIAL PROGRAM IN THE ARTS (SPA)', 'SPECIAL PROGRAM IN FOREIGN LANGUAGE (SPFL)',
    'SPECIAL PROGRAM IN JOURNALISM (SPJ)', 'SPECIAL PROGRAM IN SPORTS (SPS)',
    'SCIENCE, TECHNOLOGY, AND ENGINEERING (STE) PROGRAM',
    'SPECIAL PROGRAM IN TECHNICAL-VOCATIONAL EDUCATION (SPTVE)',
    'SPECIAL PROGRAM IN SCIENCE', 'SPED MODIFIED SUBJECTS',
    'IP RELATED SUBJECT', 'MADRASAH SUBJECTS', 'ARAL - READING', 'ARAL - MATH', 'ARAL - SCIENCE'
  ],
  'SNED': [
    'SPED MODIFIED SUBJECTS'
  ],
  'ALS': [
    'ALS LEARNING STRAND', 'COMMUNICATION SKILLS (ENGLISH)', 'COMMUNICATION SKILLS (FILIPINO)',
    'SCIENTIFIC AND CRITICAL THINKING SKILLS', 'MATHEMATICAL AND PROBLEM SOLVING SKILLS',
    'LIFE AND CAREER SKILLS', 'UNDERSTANDING THE SELF AND SOCIETY', 'DIGITAL CITIZENSHIP'
  ]
};

const getSectionSizeStatus = (gradeLevel, totalLearners) => {
  const total = Number(totalLearners) || 0;
  if (!total || total === 0) {
    return { status: 'NO ENROLLMENT', short: 'UNSET', label: 'No Enrollment Input', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' };
  }
  const gradeStr = String(gradeLevel || '').toUpperCase().trim();

  // Special Needs Education (SNED / SPED)
  if (gradeStr.includes('SNED') || gradeStr.includes('SPED')) {
    if (total < 5) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<5)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 15) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (5-15)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>15)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

  // Alternative Learning System (ALS)
  if (gradeStr.includes('ALS')) {
    if (total < 15) return { status: 'BELOW STANDARD', short: 'BELOW', label: 'Below Standard (<15)', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' };
    if (total <= 50) return { status: 'WITHIN STANDARD', short: 'WITHIN', label: 'Within Standard (15-50)', color: '#047857', bg: '#DCFCE7', border: '#6EE7B7' };
    return { status: 'ABOVE STANDARD', short: 'ABOVE', label: 'Above Standard (>50)', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
  }

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
  // Inline row editing state
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingRowData, setEditingRowData] = useState(null);
  // Inline add section row state (Regular Sections)
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const [inlineAddData, setInlineAddData] = useState({
    sectionType: 'MONO GRADE',
    gradeLevel: '',
    selectedGrades: [],
    sectionName: '',
    maleLearners: '',
    femaleLearners: '',
    advisorId: ''
  });
  // Inline add ARAL row state
  const [showInlineAddAral, setShowInlineAddAral] = useState(false);
  const [inlineAralData, setInlineAralData] = useState({ aralBasis: 'grade', aralGrade: 'Grade 3', aralToolKey: 'crla', aralProfileLevel: 'Emerging', aralLearners: 15, tutorId: '', sectionName: '' });
  // Inline add Remedial/Enrichment row state
  const [showInlineAddRemedial, setShowInlineAddRemedial] = useState(false);
  const [inlineRemedialData, setInlineRemedialData] = useState({ interventionCategory: 'REMEDIAL', gradeLevel: '', sectionName: '', maleLearners: '', femaleLearners: '', teacherId: '' });
  const ARAL_TOOLS = {
    crla: {
      domain: 'Reading',
      domainDesc: 'Reading (Gr 1-3)',
      tool: 'CRLA',
      toolFull: 'Comprehensive Rapid Literacy Assessment (Grades 1-3)',
      levels: ['Emerging', 'Developing', 'Transitioning', 'Reading at Grade Level']
    },
    philIri: {
      domain: 'Reading',
      domainDesc: 'Reading (Gr 4-10)',
      tool: 'Phil-IRI',
      toolFull: 'Philippine Informal Reading Inventory (Grades 4-10)',
      levels: ['Frustration', 'Instructional', 'Independent']
    },
    rma: {
      domain: 'Mathematics',
      domainDesc: 'Math (Gr 1-10)',
      tool: 'RMA',
      toolFull: 'Rapid Math Assessment (Grades 1-10)',
      levels: ['Not Proficient', 'Low Proficient', 'Nearly Proficient', 'Proficient', 'Highly Proficient']
    }
  };

  const normalizeAralToolKey = (val) => {
    const s = String(val || '').toLowerCase().replace(/[^a-z]/g, '');
    if (s.includes('crla')) return 'crla';
    if (s.includes('philiri') || s.includes('phil') || s.includes('iri')) return 'philIri';
    if (s.includes('rma') || s.includes('math')) return 'rma';
    return 'crla';
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

  // Subjects Taught workspace modal (opened from the "Curriculum & Subjects Taught" button)
  const [isSubjectsWorkspaceModalOpen, setIsSubjectsWorkspaceModalOpen] = useState(false);

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
      if (selectedGradeLevel === 'All') {
        baseList = MASTER_SUBJECTS_CATALOG['Junior High School']['All'].map(name => ({ name }));
      } else {
        const arr = MASTER_SUBJECTS_CATALOG['Junior High School'][selectedGradeLevel] || MASTER_SUBJECTS_CATALOG['Junior High School']['All'] || [];
        baseList = arr.map(name => ({ name, gradeLevel: selectedGradeLevel }));
      }
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
        if ((selectedBand === 'Elementary' || selectedBand === 'Junior High School') && selectedGradeLevel !== 'All' && cs.gradeLevel && cs.gradeLevel !== 'All' && cs.gradeLevel !== selectedGradeLevel) {
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



  const offerings = (schoolInfo?.curricularOffering || []).map(o => String(o).toUpperCase());
  const showElem = offerings.length === 0 || offerings.some(o => o.includes('ELEM') || o.includes('KINDER') || o.includes('PRIMARY'));
  const showJHS = offerings.length === 0 || offerings.some(o => o.includes('JHS') || o.includes('JUNIOR') || o.includes('INTERMEDIATE'));
  const showSHS = offerings.length === 0 || offerings.some(o => o.includes('SHS') || o.includes('SENIOR') || o.includes('HIGH'));

  // Inclusive education offerings from School Profile or active drafts
  const allInclusive = (() => {
    try {
      const draftKey = `insighted_school_curricular_config_${schoolInfo?.schoolId || 'default'}`;
      const storedStr = localStorage.getItem(draftKey);
      const config = storedStr ? JSON.parse(storedStr) : null;
      if (Array.isArray(config?.inclusivePrograms) && config.inclusivePrograms.length > 0) {
        return config.inclusivePrograms.map(p => String(p).toUpperCase());
      }
    } catch (e) {}
    return (Array.isArray(schoolInfo?.inclusivePrograms) ? schoolInfo.inclusivePrograms : []).map(p => String(p).toUpperCase());
  })();

  const hasALS = allInclusive.length === 0 || allInclusive.some(p => p.includes('ALS')) || offerings.some(o => o.includes('ALS')) || (classSections || []).some(s => String(s.gradeLevel || '').toUpperCase().includes('ALS'));
  const hasSNED = allInclusive.length === 0 || allInclusive.some(p => p.includes('SNED') || p.includes('SPED')) || offerings.some(o => o.includes('SNED') || o.includes('SPED')) || (classSections || []).some(s => String(s.gradeLevel || '').toUpperCase().includes('SNED'));

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

  // Include ALS & SNED when active in Inclusive Programs or school curriculum
  if (hasSNED && !availableGrades.includes('SNED')) {
    availableGrades.push('SNED');
  }
  if (hasALS && !availableGrades.includes('ALS')) {
    availableGrades.push('ALS');
  }

  const availableBands = [];
  if (showElem) availableBands.push('Elementary');
  if (showJHS) availableBands.push('Junior High School');
  if (showSHS) availableBands.push('Senior High School');
  if (availableBands.length === 0) availableBands.push('Elementary', 'Junior High School', 'Senior High School');

  const isPureSecondary = String(schoolInfo?.schoolClassification || '').toUpperCase().includes('SECONDARY') && !String(schoolInfo?.schoolClassification || '').toUpperCase().includes('INTEGRATED');
  const hasElementary = !isPureSecondary && (
    offerings.length === 0
      ? availableGrades.some(g => ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].includes(g))
      : offerings.some(o => o.includes('ELEM') || o.includes('KINDER') || o.includes('PRIMARY'))
  );

  React.useEffect(() => {
    if (availableBands.length > 0 && !availableBands.includes(selectedBand)) {
      setSelectedBand(availableBands[0]);
    }
  }, [availableBands.join(',')]);

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

  const teachingPersonnel = (Array.isArray(personnel) ? personnel : []).filter(p => p.type === 'teaching' && !p.isDraft);

  // Set of personnel IDs currently assigned as an adviser across all regular sections
  const assignedRegularAdvisorIds = useMemo(() => {
    const set = new Set();
    (classSections || []).forEach(sec => {
      if (sec?.advisorId) {
        set.add(String(sec.advisorId));
      }
    });
    return set;
  }, [classSections]);

  const multigradeGrades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

  // ---- INLINE EDITING HANDLERS ----
  const startEditingRow = (sec) => {
    if (editingRowId && editingRowId !== sec.id) return; // one at a time
    const isAralSec = String(sec.sectionType || '').startsWith('ARAL');
    const type = isAralSec ? sec.sectionType
      : (sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT') ? sec.sectionType
      : (String(sec.gradeLevel || '').includes(' - ') && hasElementary ? 'MULTIGRADE' : (!hasElementary && sec.sectionType === 'MULTIGRADE' ? 'MONO GRADE' : (sec.sectionType || 'MONO GRADE')));

    const cleanGrades = (String(sec.gradeLevel || '').includes(' - ') && hasElementary)
      ? String(sec.gradeLevel || '').split(' - ').map(s => s.trim()).filter(g => multigradeGrades.includes(g))
      : [];

    // ARAL: parse saved state
    let aralInfo = null;
    if (isAralSec) {
      const isAssessment = sec.aralBasis === 'assessment' || String(sec.sectionType || '').includes('CRLA') || String(sec.sectionType || '').includes('PHIL') || String(sec.sectionType || '').includes('RMA');
      if (isAssessment) {
        const toolKey = normalizeAralToolKey(sec.aralToolKey || sec.aralTool || sec.sectionType || sec.gradeLevel || sec.sectionName);
        const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
        const profileLevel = toolObj.levels.includes(sec.aralProfileLevel) ? sec.aralProfileLevel : toolObj.levels[0];
        aralInfo = { isAssessment: true, toolKey, profileLevel };
      } else {
        aralInfo = { isAssessment: false, toolKey: null, profileLevel: null };
      }
    }

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
      aralBasis: aralInfo ? (aralInfo.isAssessment ? 'assessment' : 'grade') : (sec.aralBasis || 'grade'),
      aralGrade: sec.aralGrade || (sec.gradeLevel && sec.gradeLevel !== 'ARAL' && !String(sec.gradeLevel).includes(' - ') ? sec.gradeLevel : 'Grade 3'),
      aralToolKey: toolKey,
      aralProfileLevel: validLevel,
      aralLearners: sec.aralLearners || sec.numberOfLearners || 15,
      tutorId: sec.tutorId || sec.advisorId || sec.adviserId || '',
      interventionCategory: sec.sectionType === 'ENRICHMENT' ? 'ENRICHMENT' : 'REMEDIAL',
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
    } else if (isRemedialOrEnrichment) {
      finalSectionType = editingRowData.interventionCategory || sec.sectionType;
      finalGradeLevel = editingRowData.gradeLevel;
    } else if (finalSectionType === 'MULTIGRADE') {
      if (!hasElementary) {
        finalSectionType = 'MONO GRADE';
      } else {
        const selected = editingRowData.selectedGrades || [];
        const cleanedSelected = selected.filter(g => multigradeGrades.includes(g));
        if (cleanedSelected.length < 2 || cleanedSelected.length > 6) {
          if (showAlert) await showAlert('Validation Error', 'Please select between 2 and 6 grade levels for a multigrade section.');
          return;
        }
        const sortedGrades = [...cleanedSelected].sort((a, b) => availableGrades.indexOf(a) - availableGrades.indexOf(b));
        finalGradeLevel = sortedGrades.join(' - ');
      }
    }

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

  // Inline ADD handlers for Regular sections
  const handleSaveInlineAdd = async () => {
    if (!inlineAddData.sectionName.trim()) {
      if (showAlert) await showAlert('Validation Error', 'Please enter a section name.');
      return;
    }
    let finalGradeLevel = inlineAddData.gradeLevel || availableGrades[0] || 'Grade 1';
    let finalSectionType = inlineAddData.sectionType;

    if (finalSectionType === 'MULTIGRADE') {
      if (!hasElementary) {
        finalSectionType = 'MONO GRADE';
      } else {
        const selected = (inlineAddData.selectedGrades || []).filter(g => multigradeGrades.includes(g));
        if (selected.length < 2 || selected.length > 6) {
          if (showAlert) await showAlert('Validation Error', 'Select between 2 and 6 grade levels for multigrade.');
          return;
        }
        const sortedGrades = [...selected].sort((a, b) => availableGrades.indexOf(a) - availableGrades.indexOf(b));
        finalGradeLevel = sortedGrades.join(' - ');
      }
    } else if (finalSectionType === 'MONO GRADE' && (!finalGradeLevel || finalGradeLevel === 'NON-GRADED')) {
      finalSectionType = finalGradeLevel === 'NON-GRADED' ? 'NON GRADED' : 'MONO GRADE';
    }

    const isDuplicate = classSections.some(s =>
      s.gradeLevel === finalGradeLevel &&
      s.sectionName.toUpperCase().trim() === inlineAddData.sectionName.toUpperCase().trim()
    );
    if (isDuplicate) {
      if (showAlert) await showAlert('Duplicate Section', `A section named "${inlineAddData.sectionName.toUpperCase().trim()}" already exists for ${finalGradeLevel}.`);
      return;
    }

    const mVal = inlineAddData.maleLearners === '' ? null : Math.min(99, Math.max(0, Number(inlineAddData.maleLearners)));
    const fVal = inlineAddData.femaleLearners === '' ? null : Math.min(99, Math.max(0, Number(inlineAddData.femaleLearners)));
    const total = (mVal || 0) + (fVal || 0);

    await addClassSection({
      gradeLevel: finalGradeLevel,
      sectionName: inlineAddData.sectionName.toUpperCase().trim(),
      advisorId: inlineAddData.advisorId || null,
      sectionType: finalSectionType,
      maleLearners: mVal,
      femaleLearners: fVal,
      numberOfLearners: total
    });

    setInlineAddData({ sectionType: 'MONO GRADE', gradeLevel: availableGrades[0] || '', selectedGrades: [], sectionName: '', maleLearners: '', femaleLearners: '', advisorId: '' });
    setShowInlineAdd(false);
    if (showToast) showToast(`✓ Section added successfully.`);
  };

  // Inline ADD handlers for ARAL sections
  const handleSaveInlineAddAral = async () => {
    if (!inlineAralData.sectionName.trim()) {
      if (showAlert) await showAlert('Validation Error', 'Please enter a section name.');
      return;
    }
    let resGrade = inlineAralData.aralGrade;
    let sectionType = 'ARAL - GRADE LEVEL';
    let toolKeyToSave = null;
    let toolObjToSave = null;
    let levelToSave = null;

    if (inlineAralData.aralBasis === 'assessment') {
      toolKeyToSave = normalizeAralToolKey(inlineAralData.aralToolKey);
      toolObjToSave = ARAL_TOOLS[toolKeyToSave] || ARAL_TOOLS.crla;
      levelToSave = toolObjToSave.levels.includes(inlineAralData.aralProfileLevel) ? inlineAralData.aralProfileLevel : toolObjToSave.levels[0];
      sectionType = `ARAL - ${toolObjToSave.tool.toUpperCase()}`;
      resGrade = `${toolObjToSave.tool} - ${levelToSave}`;
    }

    await addClassSection({
      gradeLevel: resGrade,
      sectionName: inlineAralData.sectionName.toUpperCase().trim(),
      advisorId: inlineAralData.tutorId || null,
      adviserId: inlineAralData.tutorId || null,
      tutorId: inlineAralData.tutorId || null,
      sectionType,
      aralBasis: inlineAralData.aralBasis,
      aralGrade: inlineAralData.aralBasis === 'grade' ? inlineAralData.aralGrade : undefined,
      aralToolKey: toolKeyToSave,
      aralTool: toolObjToSave ? toolObjToSave.tool : undefined,
      aralProfileLevel: levelToSave,
      numberOfLearners: Number(inlineAralData.aralLearners) || 0,
      aralLearners: Number(inlineAralData.aralLearners) || 0
    });

    setInlineAralData({ aralBasis: 'grade', aralGrade: 'Grade 3', aralToolKey: 'crla', aralProfileLevel: 'Emerging', aralLearners: 15, tutorId: '', sectionName: '' });
    setShowInlineAddAral(false);
    if (showToast) showToast(`✓ ARAL Section added.`);
  };

  // Inline ADD handlers for Remedial/Enrichment sections
  const handleSaveInlineAddRemedial = async () => {
    if (!inlineRemedialData.sectionName.trim() || !inlineRemedialData.gradeLevel) {
      if (showAlert) await showAlert('Validation Error', 'Please fill in all required fields.');
      return;
    }
    const mVal = inlineRemedialData.maleLearners === '' ? null : Math.min(99, Math.max(0, Number(inlineRemedialData.maleLearners)));
    const fVal = inlineRemedialData.femaleLearners === '' ? null : Math.min(99, Math.max(0, Number(inlineRemedialData.femaleLearners)));
    const total = (mVal || 0) + (fVal || 0);

    await addClassSection({
      gradeLevel: inlineRemedialData.gradeLevel,
      sectionName: inlineRemedialData.sectionName.toUpperCase().trim(),
      advisorId: inlineRemedialData.teacherId || null,
      adviserId: inlineRemedialData.teacherId || null,
      sectionType: inlineRemedialData.interventionCategory || 'REMEDIAL',
      maleLearners: mVal,
      femaleLearners: fVal,
      numberOfLearners: total
    });

    setInlineRemedialData({ interventionCategory: 'REMEDIAL', gradeLevel: availableGrades[0] || '', sectionName: '', maleLearners: '', femaleLearners: '', teacherId: '' });
    setShowInlineAddRemedial(false);
    if (showToast) showToast(`✓ Remedial/Enrichment Section added.`);
  };

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
      <section id="classes" className="view" style={{ width: '100%' }}>
        <article className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-inner">
            <div className="roster-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h2>Organized Classes Setup</h2>
                <p className="subtext">Configure curriculum-level sections and assign class advisers for the current school year.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleClearOrganizedClasses}
                  style={{
                    background: '#F8FAFC',
                    color: '#334155',
                    border: '1.5px solid #CBD5E1',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                  title="Clear all organized class sections in local draft to set up sections manually"
                >
                  <FiTrash2 size={13} /> Clear Organized Classes
                </button>
                <button
                  type="button"
                  onClick={() => setIsSubjectsWorkspaceModalOpen(true)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '9px',
                    border: '1.5px solid #BFDBFE',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    fontWeight: '800',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <FiBookOpen size={16} />
                  Curriculum & Subjects Taught
                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', background: '#DBEAFE', color: '#1E40AF' }}>
                    {getSubjectsForView().length}
                  </span>
                </button>
              </div>
            </div>

          {/* Total Enrollment Metric */}
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

            return (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                margin: '16px 0 0 0',
                background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid #BFDBFE',
                maxWidth: '420px'
              }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#2563EB', color: 'white', display: 'grid', placeItems: 'center', fontWeight: '900' }}>
                  <FiUsers size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    TOTAL ENROLLED
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#1E3A8A', display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    {totalSchool} <span style={{ fontSize: '12px', fontWeight: '700', color: '#3B82F6' }}>Learners</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#166534', background: '#DCFCE7', padding: '1px 7px', borderRadius: '10px' }}>
                      {totalMale} M
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#9D174D', background: '#FCE7F3', padding: '1px 7px', borderRadius: '10px' }}>
                      {totalFemale} F
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
          </div>
        </article>

        {(() => {
            // Separate sections by type
            const regularSections = classSections.filter(s => !String(s.sectionType || '').startsWith('ARAL') && s.sectionType !== 'REMEDIAL' && s.sectionType !== 'ENRICHMENT');
            const aralSections = classSections.filter(s => String(s.sectionType || '').startsWith('ARAL') || String(s.sectionType || '').includes('ARAL'));
            const remedialSections = classSections.filter(s => s.sectionType === 'REMEDIAL' || s.sectionType === 'ENRICHMENT');

            const regularTotal = sec => {
              const mVal = Number(sec.maleLearners) || 0;
              const fVal = Number(sec.femaleLearners) || 0;
              const hasGender = (sec.maleLearners !== null && sec.maleLearners !== undefined && sec.maleLearners !== '') || (sec.femaleLearners !== null && sec.femaleLearners !== undefined && sec.femaleLearners !== '');
              return hasGender ? (mVal + fVal) : (Number(sec.numberOfLearners) !== 35 && sec.numberOfLearners ? Number(sec.numberOfLearners) : 0);
            };
            const regularColumns = [
              { key: 'classType', label: 'Class Type', getValue: sec => (String(sec.gradeLevel || '').includes(' - ') || sec.sectionType === 'MULTIGRADE') ? 'Multi Grade' : 'Mono Grade' },
              { key: 'gradeLevel', label: 'Grade Level', getValue: sec => sec.gradeLevel },
              { key: 'sectionName', label: 'Section Name', getValue: sec => sec.sectionName },
              { key: 'male', label: '♂', align: 'center', width: '60px', getValue: sec => Number(sec.maleLearners) || 0 },
              { key: 'female', label: '♀', align: 'center', width: '60px', getValue: sec => Number(sec.femaleLearners) || 0 },
              { key: 'total', label: 'Total', align: 'center', width: '70px', getValue: regularTotal },
              { key: 'adviser', label: 'Class Adviser', getValue: sec => { const a = personnel.find(p => p.id === sec.advisorId); return a ? `${a.firstName} ${a.lastName}` : ''; } },
              { key: 'actions', label: 'Actions', align: 'center', width: '90px', sortable: false, filterable: false, getValue: () => '' }
            ];
            const regularTable = useSortableFilterableTable(regularSections, regularColumns);

            const aralColumns = [
              { key: 'basis', label: '1. ARAL Basis', getValue: sec => (sec.aralBasis === 'assessment' || String(sec.sectionType || '').includes('CRLA') || String(sec.sectionType || '').includes('PHIL') || String(sec.sectionType || '').includes('RMA')) ? 'Assessment Profile' : 'Grade Level' },
              { key: 'target', label: '2. Target / Assessment Profile', getValue: sec => sec.aralGrade || sec.gradeLevel || '' },
              { key: 'sectionName', label: 'Section Name', getValue: sec => sec.sectionName },
              { key: 'learners', label: 'Learners', align: 'center', width: '80px', getValue: sec => Number(sec.aralLearners || sec.numberOfLearners) || 0 },
              { key: 'tutor', label: 'Section Tutor', getValue: sec => { const t = personnel.find(p => p.id === (sec.tutorId || sec.advisorId || sec.adviserId)); return t ? `${t.firstName} ${t.lastName}` : ''; } },
              { key: 'actions', label: 'Actions', align: 'center', width: '90px', sortable: false, filterable: false, getValue: () => '' }
            ];
            const aralTable = useSortableFilterableTable(aralSections, aralColumns);

            const remedialColumns = [
              { key: 'category', label: 'Intervention Category', getValue: sec => sec.sectionType === 'ENRICHMENT' ? 'ENRICHMENT' : 'REMEDIAL' },
              { key: 'gradeLevel', label: 'Target Grade', getValue: sec => sec.gradeLevel },
              { key: 'sectionName', label: 'Section Name', getValue: sec => sec.sectionName },
              { key: 'male', label: '♂', align: 'center', width: '60px', getValue: sec => Number(sec.maleLearners) || 0 },
              { key: 'female', label: '♀', align: 'center', width: '60px', getValue: sec => Number(sec.femaleLearners) || 0 },
              { key: 'total', label: 'Total', align: 'center', width: '70px', getValue: sec => (Number(sec.maleLearners) || 0) + (Number(sec.femaleLearners) || 0) },
              { key: 'teacher', label: 'Assigned Teacher', getValue: sec => { const t = personnel.find(p => p.id === (sec.advisorId || sec.adviserId)); return t ? `${t.firstName} ${t.lastName}` : ''; } },
              { key: 'actions', label: 'Actions', align: 'center', width: '90px', sortable: false, filterable: false, getValue: () => '' }
            ];
            const remedialTable = useSortableFilterableTable(remedialSections, remedialColumns);

            const cellInput = { padding: '5px 8px', borderRadius: '6px', border: '1.5px solid #CBD5E1', fontSize: '12px', fontWeight: '700', width: '100%', boxSizing: 'border-box' };
            const cellSelect = { ...cellInput, background: 'white' };

            const renderEditRow = (sec) => {
              if (!editingRowData || editingRowData.id !== sec.id) return null;
              const d = editingRowData;
              const isAral = String(sec.sectionType || '').startsWith('ARAL');
              const isRem = sec.sectionType === 'REMEDIAL' || sec.sectionType === 'ENRICHMENT';
              const isMulti = d.sectionType === 'MULTIGRADE' && hasElementary;

              const currentAdvisorId = d.advisorId || d.tutorId || '';
              const availableAdvisors = teachingPersonnel.filter(p =>
                String(p.id) === String(currentAdvisorId) || !assignedRegularAdvisorIds.has(String(p.id))
              );

              if (isAral) {
                const toolKey = normalizeAralToolKey(d.aralToolKey);
                const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
                return (
                  <tr key={`edit-${sec.id}`} style={{ background: '#F0F9FF', outline: '2px solid #38BDF8', outlineOffset: '-2px' }}>
                    <td>
                      <select style={cellSelect} value={d.aralBasis} onChange={e => setEditingRowData({ ...d, aralBasis: e.target.value, aralProfileLevel: ARAL_TOOLS[normalizeAralToolKey(d.aralToolKey)].levels[0] })}>
                        <option value="grade">Grade Level</option>
                        <option value="assessment">Assessment Profile</option>
                      </select>
                    </td>
                    <td>
                      {d.aralBasis === 'grade' ? (
                        <select style={cellSelect} value={d.aralGrade} onChange={e => setEditingRowData({ ...d, aralGrade: e.target.value })}>
                          {availableGrades.filter(g => !g.includes('NON')).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <select style={cellSelect} value={d.aralToolKey} onChange={e => {
                            const tk = normalizeAralToolKey(e.target.value);
                            setEditingRowData({ ...d, aralToolKey: tk, aralProfileLevel: ARAL_TOOLS[tk].levels[0] });
                          }}>
                            <option value="crla">CRLA — Reading (Gr 1-3)</option>
                            <option value="philIri">Phil-IRI — Reading (Gr 4-10)</option>
                            <option value="rma">RMA — Math (Gr 1-10)</option>
                          </select>
                          <select style={cellSelect} value={toolObj.levels.includes(d.aralProfileLevel) ? d.aralProfileLevel : toolObj.levels[0]} onChange={e => setEditingRowData({ ...d, aralProfileLevel: e.target.value })}>
                            {toolObj.levels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                          </select>
                        </div>
                      )}
                    </td>
                    <td><input style={cellInput} value={d.sectionName} onChange={e => setEditingRowData({ ...d, sectionName: e.target.value.toUpperCase() })} placeholder="SECTION NAME" /></td>
                    <td><input style={{ ...cellInput, width: '70px' }} type="number" min="1" max="999" value={d.aralLearners} onChange={e => setEditingRowData({ ...d, aralLearners: e.target.value })} /></td>
                    <td>
                      <select style={cellSelect} value={d.tutorId || d.advisorId || ''} onChange={e => setEditingRowData({ ...d, tutorId: e.target.value, advisorId: e.target.value })}>
                        <option value="">-- Select Tutor --</option>
                        {teachingPersonnel.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => handleSaveInlineEdit(sec)} style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheck size={12} /> Save</button>
                        <button type="button" onClick={handleCancelInlineEdit} style={{ background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel"><FiX size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }

              if (isRem) {
                return (
                  <tr key={`edit-${sec.id}`} style={{ background: '#F5F3FF', outline: '2px solid #A78BFA', outlineOffset: '-2px' }}>
                    <td>
                      <select style={cellSelect} value={d.interventionCategory || 'REMEDIAL'} onChange={e => setEditingRowData({ ...d, interventionCategory: e.target.value })}>
                        <option value="REMEDIAL">REMEDIAL</option>
                        <option value="ENRICHMENT">ENRICHMENT</option>
                      </select>
                    </td>
                    <td>
                      <select style={cellSelect} value={d.gradeLevel} onChange={e => setEditingRowData({ ...d, gradeLevel: e.target.value })}>
                        {availableGrades.filter(g => !g.includes('NON')).map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td><input style={cellInput} value={d.sectionName} onChange={e => setEditingRowData({ ...d, sectionName: e.target.value.toUpperCase() })} placeholder="SECTION NAME" /></td>
                    <td><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.maleLearners} onChange={e => setEditingRowData({ ...d, maleLearners: e.target.value })} placeholder="♂" /></td>
                    <td><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.femaleLearners} onChange={e => setEditingRowData({ ...d, femaleLearners: e.target.value })} placeholder="♀" /></td>
                    <td><span style={{ fontSize: '12px', fontWeight: '800', color: '#047857', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px' }}>{(Number(d.maleLearners)||0)+(Number(d.femaleLearners)||0)}</span></td>
                    <td>
                      <select style={cellSelect} value={d.advisorId || ''} onChange={e => setEditingRowData({ ...d, advisorId: e.target.value })}>
                        <option value="">-- Select Teacher --</option>
                        {teachingPersonnel.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => handleSaveInlineEdit(sec)} style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheck size={12} /> Save</button>
                        <button type="button" onClick={handleCancelInlineEdit} style={{ background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel"><FiX size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }

              // Regular section edit row
              return (
                <tr key={`edit-${sec.id}`} style={{ background: '#F0F9FF', outline: '2px solid #38BDF8', outlineOffset: '-2px' }}>
                  <td>
                    <select style={cellSelect} value={d.sectionType} onChange={e => setEditingRowData({ ...d, sectionType: e.target.value, selectedGrades: [] })}>
                      <option value="MONO GRADE">Mono Grade</option>
                      {hasElementary && <option value="MULTIGRADE">Multi Grade</option>}
                    </select>
                  </td>
                  <td>
                    {isMulti ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {multigradeGrades.map(g => (
                          <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={(d.selectedGrades || []).includes(g)} onChange={() => {
                              const cur = d.selectedGrades || [];
                              const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g];
                              setEditingRowData({ ...d, selectedGrades: next });
                            }} style={{ width: 'auto', minHeight: 'auto' }} />
                            {g.replace('Grade ', 'G')}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <select style={cellSelect} value={d.gradeLevel} onChange={e => setEditingRowData({ ...d, gradeLevel: e.target.value })}>
                        {availableGrades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    )}
                  </td>
                  <td><input style={cellInput} value={d.sectionName} onChange={e => setEditingRowData({ ...d, sectionName: e.target.value.toUpperCase() })} placeholder="SECTION NAME" /></td>
                  <td><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.maleLearners} onChange={e => setEditingRowData({ ...d, maleLearners: e.target.value })} placeholder="♂" /></td>
                  <td><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.femaleLearners} onChange={e => setEditingRowData({ ...d, femaleLearners: e.target.value })} placeholder="♀" /></td>
                  <td><span style={{ fontSize: '12px', fontWeight: '800', color: '#047857', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px' }}>{(Number(d.maleLearners)||0)+(Number(d.femaleLearners)||0)}</span></td>
                  <td>
                    <select style={cellSelect} value={d.advisorId} onChange={e => setEditingRowData({ ...d, advisorId: e.target.value })}>
                      <option value="">-- Select Adviser --</option>
                      {availableAdvisors.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" onClick={() => handleSaveInlineEdit(sec)} style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheck size={12} /> Save</button>
                      <button type="button" onClick={handleCancelInlineEdit} style={{ background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel"><FiX size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            };

            return (
              <>
                {/* ===== REGULAR SECTIONS TABLE (own card) ===== */}
                <article className="card" style={{ width: '100%', marginBottom: '24px' }}>
                <div className="card-inner">
                <div className="roster-card-header">
                  <div>
                    <h2 style={{ fontSize: '15px' }}>Class Sections & Advisers <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: '10px', marginLeft: '8px' }}>{regularSections.length} Section{regularSections.length !== 1 ? 's' : ''}</span></h2>
                  </div>
                </div>
                <div style={{ overflowX: 'auto', border: '1.5px solid #E2E8F0', borderRadius: '14px', marginBottom: '24px' }}>
                  <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <SortableTableHead
                      columns={regularColumns}
                      sortConfig={regularTable.sortConfig}
                      requestSort={regularTable.requestSort}
                      filters={regularTable.filters}
                      setFilter={regularTable.setFilter}
                    />
                    <tbody>
                      {regularTable.processedRows.map(sec => {
                        if (editingRowData && editingRowData.id === sec.id) return renderEditRow(sec);
                        const advisor = personnel.find(p => p.id === sec.advisorId);
                        const isMultigrade = String(sec.gradeLevel || '').includes(' - ') || sec.sectionType === 'MULTIGRADE';
                        const mVal = Number(sec.maleLearners) || 0;
                        const fVal = Number(sec.femaleLearners) || 0;
                        const hasGender = (sec.maleLearners !== null && sec.maleLearners !== undefined && sec.maleLearners !== '') || (sec.femaleLearners !== null && sec.femaleLearners !== undefined && sec.femaleLearners !== '');
                        const total = hasGender ? (mVal + fVal) : (Number(sec.numberOfLearners) !== 35 && sec.numberOfLearners ? Number(sec.numberOfLearners) : 0);
                        const isBeingEdited = !!editingRowId && editingRowId !== sec.id;

                        return (
                          <tr key={sec.id} style={{ borderTop: '1px solid #F1F5F9', opacity: isBeingEdited ? 0.5 : 1 }}>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', background: isMultigrade ? '#FEF3C7' : '#EFF6FF', color: isMultigrade ? '#B45309' : '#1D4ED8', border: `1px solid ${isMultigrade ? '#FDE68A' : '#BFDBFE'}`, textTransform: 'uppercase' }}>
                                {isMultigrade ? 'Multi Grade' : 'Mono Grade'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: '#1E293B' }}>
                              {isMultigrade
                                ? String(sec.gradeLevel || '').split(' - ').map(g => (
                                  <span key={g} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '800', background: '#FEF9C3', color: '#92400E', marginRight: '3px', display: 'inline-block' }}>{g}</span>
                                ))
                                : sec.gradeLevel}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0F172A' }}>{sec.sectionName}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1D4ED8', fontWeight: '700' }}>{mVal || '—'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#BE185D', fontWeight: '700' }}>{fVal || '—'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: '800', color: total > 0 ? '#047857' : '#94A3B8', background: total > 0 ? '#DCFCE7' : '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>{total || '—'}</span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {advisor
                                ? <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '12px' }}>{advisor.firstName} {advisor.lastName}</span>
                                : <span style={{ fontSize: '11px', color: '#EF4444', fontStyle: 'italic', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiAlertCircle size={12} /> Unassigned</span>}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button type="button" disabled={isBeingEdited} onClick={() => startEditingRow(sec)} style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: isBeingEdited ? 'not-allowed' : 'pointer' }}><FiEdit2 size={11} /> Edit</button>
                                <button type="button" disabled={isBeingEdited} onClick={async () => { if (await showConfirm('Remove Section', `Remove ${sec.sectionName}?`)) removeClassSection(sec.id); }} style={{ background: 'none', color: '#EF4444', border: 'none', cursor: isBeingEdited ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px' }} title="Delete Section"><FiTrash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {regularSections.length === 0 && !showInlineAdd && (
                        <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontStyle: 'italic', fontSize: '13px' }}>No regular sections yet.</td></tr>
                      )}
                      {/* Inline Add Row for Regular */}
                      {showInlineAdd && (() => {
                        const d = inlineAddData;
                        const isMulti = d.sectionType === 'MULTIGRADE' && hasElementary;
                        const availableAdvisorsForNew = teachingPersonnel.filter(p => !assignedRegularAdvisorIds.has(String(p.id)));
                        return (
                          <tr style={{ background: '#F0FDF4', outline: '2px solid #86EFAC', outlineOffset: '-2px' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <select style={cellInput} value={d.sectionType} onChange={e => setInlineAddData({ ...d, sectionType: e.target.value, selectedGrades: [], gradeLevel: availableGrades[0] || '' })}>
                                <option value="MONO GRADE">Mono Grade</option>
                                {hasElementary && <option value="MULTIGRADE">Multi Grade</option>}
                              </select>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {isMulti ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {multigradeGrades.map(g => (
                                    <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={(d.selectedGrades || []).includes(g)} onChange={() => {
                                        const cur = d.selectedGrades || [];
                                        const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g];
                                        setInlineAddData({ ...d, selectedGrades: next });
                                      }} style={{ width: 'auto', minHeight: 'auto' }} />
                                      {g.replace('Grade ', 'G')}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <select style={cellInput} value={d.gradeLevel || availableGrades[0]} onChange={e => setInlineAddData({ ...d, gradeLevel: e.target.value })}>
                                  {availableGrades.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input style={cellInput} value={d.sectionName} onChange={e => setInlineAddData({ ...d, sectionName: e.target.value.toUpperCase() })} placeholder="SECTION NAME" autoFocus />
                            </td>
                            <td style={{ padding: '8px 10px' }}><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.maleLearners} onChange={e => setInlineAddData({ ...d, maleLearners: e.target.value })} placeholder="♂" /></td>
                            <td style={{ padding: '8px 10px' }}><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.femaleLearners} onChange={e => setInlineAddData({ ...d, femaleLearners: e.target.value })} placeholder="♀" /></td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}><span style={{ fontSize: '12px', fontWeight: '800', color: '#047857', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px' }}>{(Number(d.maleLearners)||0)+(Number(d.femaleLearners)||0)}</span></td>
                            <td style={{ padding: '8px 10px' }}>
                              <select style={cellInput} value={d.advisorId} onChange={e => setInlineAddData({ ...d, advisorId: e.target.value })}>
                                <option value="">-- Adviser (Optional) --</option>
                                {availableAdvisorsForNew.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button type="button" onClick={handleSaveInlineAdd} style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheck size={12} /> Save</button>
                                <button type="button" onClick={() => setShowInlineAdd(false)} style={{ background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel"><FiX size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                      {/* Dashed add row trigger */}
                      {!showInlineAdd && (
                        <tr
                          onClick={() => {
                            if (editingRowId) return;
                            setInlineAddData({ sectionType: 'MONO GRADE', gradeLevel: availableGrades[0] || '', selectedGrades: [], sectionName: '', maleLearners: '', femaleLearners: '', advisorId: '' });
                            setShowInlineAdd(true);
                          }}
                          style={{ cursor: editingRowId ? 'not-allowed' : 'pointer', opacity: editingRowId ? 0.4 : 1 }}
                        >
                          <td colSpan="8" style={{ padding: '10px 16px', textAlign: 'center', border: '2px dashed #CBD5E1', borderRadius: '0 0 12px 12px', color: '#64748B', fontSize: '13px', fontWeight: '700', background: '#FAFAFA' }}>
                            + Add Section
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                </div>
                </article>

                {/* ===== ARAL SECTIONS TABLE (own card) ===== */}
                <article className="card" style={{ width: '100%', marginBottom: '24px' }}>
                <div className="card-inner">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#15803D', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><FiTarget size={16} /> ARAL Sections <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: '10px', marginLeft: '8px' }}>{aralSections.length} Section{aralSections.length !== 1 ? 's' : ''}</span></h3>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>Not counted in base school enrollment</p>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto', border: '1.5px solid #BBF7D0', borderRadius: '14px' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <SortableTableHead
                        columns={aralColumns}
                        sortConfig={aralTable.sortConfig}
                        requestSort={aralTable.requestSort}
                        filters={aralTable.filters}
                        setFilter={aralTable.setFilter}
                        headerBg="#F0FDF4"
                        headerColor="#15803D"
                      />
                      <tbody>
                        {aralTable.processedRows.map(sec => {
                          if (editingRowData && editingRowData.id === sec.id) return renderEditRow(sec);
                          const tutor = personnel.find(p => p.id === (sec.tutorId || sec.advisorId || sec.adviserId));
                          const isAssessmentBasis = sec.aralBasis === 'assessment' || String(sec.sectionType || '').includes('CRLA') || String(sec.sectionType || '').includes('PHIL') || String(sec.sectionType || '').includes('RMA');
                          const toolKey = isAssessmentBasis ? normalizeAralToolKey(sec.aralToolKey || sec.aralTool || sec.sectionType || sec.gradeLevel) : null;
                          const toolObj = toolKey ? (ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla) : null;
                          const profileLevel = toolObj ? (toolObj.levels.includes(sec.aralProfileLevel) ? sec.aralProfileLevel : toolObj.levels[0]) : null;
                          const isBeingEdited = !!editingRowId && editingRowId !== sec.id;
                          return (
                            <tr key={sec.id} style={{ borderTop: '1px solid #DCFCE7', opacity: isBeingEdited ? 0.5 : 1 }}>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', background: isAssessmentBasis ? '#F0FDF4' : '#EFF6FF', color: isAssessmentBasis ? '#15803D' : '#1D4ED8', border: `1px solid ${isAssessmentBasis ? '#BBF7D0' : '#BFDBFE'}` }}>
                                  {isAssessmentBasis ? 'Assessment Profile' : 'Grade Level'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isAssessmentBasis && toolObj ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '800', background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', display: 'inline-block' }}>
                                      <FiLayers size={11} /> {toolObj.tool} — {toolObj.domainDesc}
                                    </span>
                                    <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', background: '#FEF9C3', color: '#854D0E', border: '1px solid #FDE68A', display: 'inline-block' }}>
                                      <FiTag size={11} /> {profileLevel}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}>
                                    <FiBook size={11} /> {sec.aralGrade || sec.gradeLevel}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0F172A' }}>{sec.sectionName}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: '800', color: '#047857', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px' }}>{sec.aralLearners || sec.numberOfLearners || '—'}</span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {tutor ? <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '12px' }}>{tutor.firstName} {tutor.lastName}</span>
                                  : <span style={{ fontSize: '11px', color: '#EF4444', fontStyle: 'italic', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiAlertCircle size={12} /> Unassigned</span>}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                  <button type="button" disabled={isBeingEdited} onClick={() => startEditingRow(sec)} style={{ background: '#ECFDF5', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: isBeingEdited ? 'not-allowed' : 'pointer' }}><FiEdit2 size={11} /> Edit</button>
                                  <button type="button" disabled={isBeingEdited} onClick={async () => { if (await showConfirm('Remove ARAL Section', `Remove ${sec.sectionName}?`)) removeClassSection(sec.id); }} style={{ background: 'none', color: '#EF4444', border: 'none', cursor: isBeingEdited ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px' }} title="Delete Section"><FiTrash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {aralSections.length === 0 && !showInlineAddAral && (
                          <tr><td colSpan="6" style={{ textAlign: 'center', padding: '16px', color: '#94A3B8', fontStyle: 'italic', fontSize: '13px' }}>No ARAL sections yet.</td></tr>
                        )}
                        {/* Inline Add ARAL Row */}
                        {showInlineAddAral && (() => {
                          const d = inlineAralData;
                          const toolKey = normalizeAralToolKey(d.aralToolKey);
                          const toolObj = ARAL_TOOLS[toolKey] || ARAL_TOOLS.crla;
                          return (
                            <tr style={{ background: '#F0FDF4', outline: '2px solid #86EFAC', outlineOffset: '-2px' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <select style={cellInput} value={d.aralBasis} onChange={e => setInlineAralData({ ...d, aralBasis: e.target.value, aralProfileLevel: ARAL_TOOLS[normalizeAralToolKey(d.aralToolKey)].levels[0] })}>
                                  <option value="grade">Grade Level</option>
                                  <option value="assessment">Assessment Profile</option>
                                </select>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {d.aralBasis === 'grade' ? (
                                  <select style={cellInput} value={d.aralGrade} onChange={e => setInlineAralData({ ...d, aralGrade: e.target.value })}>
                                    {availableGrades.filter(g => !g.includes('NON')).map(g => <option key={g} value={g}>{g}</option>)}
                                  </select>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <select style={cellInput} value={d.aralToolKey} onChange={e => {
                                      const tk = normalizeAralToolKey(e.target.value);
                                      setInlineAralData({ ...d, aralToolKey: tk, aralProfileLevel: ARAL_TOOLS[tk].levels[0] });
                                    }}>
                                      <option value="crla">CRLA — Reading (Gr 1-3)</option>
                                      <option value="philIri">Phil-IRI — Reading (Gr 4-10)</option>
                                      <option value="rma">RMA — Math (Gr 1-10)</option>
                                    </select>
                                    <select style={cellInput} value={toolObj.levels.includes(d.aralProfileLevel) ? d.aralProfileLevel : toolObj.levels[0]} onChange={e => setInlineAralData({ ...d, aralProfileLevel: e.target.value })}>
                                      {toolObj.levels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                                    </select>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px' }}><input style={cellInput} value={d.sectionName} onChange={e => setInlineAralData({ ...d, sectionName: e.target.value.toUpperCase() })} placeholder="SECTION NAME" autoFocus /></td>
                              <td style={{ padding: '8px 10px' }}><input style={{ ...cellInput, width: '70px' }} type="number" min="1" max="999" value={d.aralLearners} onChange={e => setInlineAralData({ ...d, aralLearners: e.target.value })} /></td>
                              <td style={{ padding: '8px 10px' }}>
                                <select style={cellInput} value={d.tutorId || ''} onChange={e => setInlineAralData({ ...d, tutorId: e.target.value })}>
                                  <option value="">-- Select Tutor --</option>
                                  {teachingPersonnel.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button type="button" onClick={handleSaveInlineAddAral} style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheck size={12} /> Save</button>
                                  <button type="button" onClick={() => setShowInlineAddAral(false)} style={{ background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel"><FiX size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                        {!showInlineAddAral && (
                          <tr onClick={() => { if (editingRowId) return; setInlineAralData({ aralBasis: 'grade', aralGrade: availableGrades.filter(g => !g.includes('NON') && !g.includes('Kinder'))[0] || 'Grade 3', aralToolKey: 'crla', aralProfileLevel: 'Emerging', aralLearners: 15, tutorId: '', sectionName: '' }); setShowInlineAddAral(true); }} style={{ cursor: editingRowId ? 'not-allowed' : 'pointer', opacity: editingRowId ? 0.4 : 1 }}>
                            <td colSpan="6" style={{ padding: '10px 16px', textAlign: 'center', border: '2px dashed #BBF7D0', borderRadius: '0 0 12px 12px', color: '#15803D', fontSize: '13px', fontWeight: '700', background: '#F0FDF4' }}>
                              + Add ARAL Section
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                </article>

                {/* ===== REMEDIAL/ENRICHMENT SECTIONS TABLE (own card) ===== */}
                <article className="card" style={{ width: '100%', marginBottom: '16px' }}>
                <div className="card-inner">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#7E22CE', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><FiBookOpen size={16} /> Remedial / Enrichment Sections <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: '10px', marginLeft: '8px' }}>{remedialSections.length} Section{remedialSections.length !== 1 ? 's' : ''}</span></h3>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>Workload remediation row creation</p>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto', border: '1.5px solid #E9D5FF', borderRadius: '14px' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <SortableTableHead
                        columns={remedialColumns}
                        sortConfig={remedialTable.sortConfig}
                        requestSort={remedialTable.requestSort}
                        filters={remedialTable.filters}
                        setFilter={remedialTable.setFilter}
                        headerBg="#FAF5FF"
                        headerColor="#7E22CE"
                      />
                      <tbody>
                        {remedialTable.processedRows.map(sec => {
                          if (editingRowData && editingRowData.id === sec.id) return renderEditRow(sec);
                          const teacher = personnel.find(p => p.id === (sec.advisorId || sec.adviserId));
                          const mVal = Number(sec.maleLearners) || 0;
                          const fVal = Number(sec.femaleLearners) || 0;
                          const total = mVal + fVal;
                          const isBeingEdited = !!editingRowId && editingRowId !== sec.id;
                          return (
                            <tr key={sec.id} style={{ borderTop: '1px solid #F3E8FF', opacity: isBeingEdited ? 0.5 : 1 }}>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', background: sec.sectionType === 'ENRICHMENT' ? '#EFF6FF' : '#FAF5FF', color: sec.sectionType === 'ENRICHMENT' ? '#1D4ED8' : '#7E22CE', border: `1px solid ${sec.sectionType === 'ENRICHMENT' ? '#BFDBFE' : '#E9D5FF'}` }}>
                                  {sec.sectionType === 'ENRICHMENT' ? 'ENRICHMENT' : 'REMEDIAL'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: '700', color: '#1E293B' }}>{sec.gradeLevel}</td>
                              <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0F172A' }}>{sec.sectionName}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1D4ED8', fontWeight: '700' }}>{mVal || '—'}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#BE185D', fontWeight: '700' }}>{fVal || '—'}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: '800', color: total > 0 ? '#047857' : '#94A3B8', background: total > 0 ? '#DCFCE7' : '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>{total || '—'}</span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {teacher ? <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '12px' }}>{teacher.firstName} {teacher.lastName}</span>
                                  : <span style={{ fontSize: '11px', color: '#EF4444', fontStyle: 'italic', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiAlertCircle size={12} /> Unassigned</span>}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                  <button type="button" disabled={isBeingEdited} onClick={() => startEditingRow(sec)} style={{ background: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: isBeingEdited ? 'not-allowed' : 'pointer' }}><FiEdit2 size={11} /> Edit</button>
                                  <button type="button" disabled={isBeingEdited} onClick={async () => { if (await showConfirm('Remove Section', `Remove ${sec.sectionName}?`)) removeClassSection(sec.id); }} style={{ background: 'none', color: '#EF4444', border: 'none', cursor: isBeingEdited ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px' }} title="Delete Section"><FiTrash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {remedialSections.length === 0 && !showInlineAddRemedial && (
                          <tr><td colSpan="8" style={{ textAlign: 'center', padding: '16px', color: '#94A3B8', fontStyle: 'italic', fontSize: '13px' }}>No remedial/enrichment sections yet.</td></tr>
                        )}
                        {showInlineAddRemedial && (() => {
                          const d = inlineRemedialData;
                          return (
                            <tr style={{ background: '#FAF5FF', outline: '2px solid #D8B4FE', outlineOffset: '-2px' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <select style={cellInput} value={d.interventionCategory || 'REMEDIAL'} onChange={e => setInlineRemedialData({ ...d, interventionCategory: e.target.value })}>
                                  <option value="REMEDIAL">REMEDIAL</option>
                                  <option value="ENRICHMENT">ENRICHMENT</option>
                                </select>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <select style={cellInput} value={d.gradeLevel || availableGrades[0]} onChange={e => setInlineRemedialData({ ...d, gradeLevel: e.target.value })}>
                                  {availableGrades.filter(g => !g.includes('NON')).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '8px 10px' }}><input style={cellInput} value={d.sectionName} onChange={e => setInlineRemedialData({ ...d, sectionName: e.target.value.toUpperCase() })} placeholder="SECTION NAME" autoFocus /></td>
                              <td style={{ padding: '8px 10px' }}><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.maleLearners} onChange={e => setInlineRemedialData({ ...d, maleLearners: e.target.value })} placeholder="♂" /></td>
                              <td style={{ padding: '8px 10px' }}><input style={{ ...cellInput, width: '55px' }} type="number" min="0" max="99" value={d.femaleLearners} onChange={e => setInlineRemedialData({ ...d, femaleLearners: e.target.value })} placeholder="♀" /></td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}><span style={{ fontSize: '12px', fontWeight: '800', color: '#047857', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px' }}>{(Number(d.maleLearners)||0)+(Number(d.femaleLearners)||0)}</span></td>
                              <td style={{ padding: '8px 10px' }}>
                                <select style={cellInput} value={d.teacherId || ''} onChange={e => setInlineRemedialData({ ...d, teacherId: e.target.value })}>
                                  <option value="">-- Select Teacher --</option>
                                  {teachingPersonnel.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button type="button" onClick={handleSaveInlineAddRemedial} style={{ background: '#16A34A', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheck size={12} /> Save</button>
                                  <button type="button" onClick={() => setShowInlineAddRemedial(false)} style={{ background: '#F1F5F9', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel"><FiX size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                        {!showInlineAddRemedial && (
                          <tr onClick={() => { if (editingRowId) return; setInlineRemedialData({ interventionCategory: 'REMEDIAL', gradeLevel: availableGrades[0] || '', sectionName: '', maleLearners: '', femaleLearners: '', teacherId: '' }); setShowInlineAddRemedial(true); }} style={{ cursor: editingRowId ? 'not-allowed' : 'pointer', opacity: editingRowId ? 0.4 : 1 }}>
                            <td colSpan="8" style={{ padding: '10px 16px', textAlign: 'center', border: '2px dashed #E9D5FF', borderRadius: '0 0 12px 12px', color: '#7E22CE', fontSize: '13px', fontWeight: '700', background: '#FAF5FF' }}>
                              + Add Remedial / Enrichment Section
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                </article>
              </>
            );
          })()}

      {/* Subjects Taught — opened as a modal from the "Curriculum & Subjects Taught" button */}
      {isSubjectsWorkspaceModalOpen && (
      <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1000, padding: '16px' }}>
      <article className="card" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', marginBottom: 0, borderRadius: '24px', border: '2.5px solid var(--outline)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        <div className="card-inner">
          <div className="roster-card-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--navy)' }}>Subjects Taught</h2>
              <p className="subtext">Configure active subjects offered by grade band in your school.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsSubjectsWorkspaceModalOpen(false)}
                style={{ borderRadius: '50%', width: '36px', height: '36px', minWidth: '36px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}
              >
                <FiX size={18} />
              </button>
            </div>
          </div>

          {/* Grade Band Selector Tabs & Grade Level Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
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
              <div style={{ flex: 1, minWidth: '160px', position: 'relative' }}>
                <FiSearch size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748B', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search subject..."
                  value={subjectSearchQuery}
                  onChange={(e) => setSubjectSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '35px',
                    padding: '0 10px 0 32px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--line)',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'var(--navy)',
                    background: 'white',
                    boxSizing: 'border-box'
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
                  transition: 'all 0.15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <FiCheck size={12} /> Check All
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
                  transition: 'all 0.15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <FiX size={12} /> Uncheck All
              </button>
            </div>
          </div>

          {/* Subjects List with On/Off Toggles (Responsive Multi-Column Grid) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px', maxHeight: '600px', overflowY: 'auto', padding: '4px' }}>
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
              <button className="btn secondary" type="button" onClick={() => setIsSubjectModalOpen(false)} style={{ borderRadius: '50%', width: '34px', height: '34px', minWidth: '34px', padding: 0, display: 'grid', placeItems: 'center', fontSize: '18px' }}><FiX size={18} /></button>
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

