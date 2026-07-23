"""
Karnataka geography reference data for the FIR registration form.

All 31 districts of Karnataka with headquarters coordinates and a representative
set of police stations per district (headquarters city + major taluk-town
stations). Used to populate the registration dropdowns and to fall back to a
district centroid when no exact map location is provided.

Station lists are representative (HQ + taluk-level), suitable for a working
system; extend a district's list as needed.
"""

# Official 31 districts (kept names consistent with the existing analytics data
# where they overlap: Bengaluru Urban/Rural, Mysuru, Belagavi, etc.).
DISTRICTS = [
    "Bagalkot", "Ballari", "Belagavi", "Bengaluru Urban", "Bengaluru Rural",
    "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
    "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri",
    "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
    "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada",
    "Vijayapura", "Yadgir", "Vijayanagara",
]

# District headquarters coordinates (approximate) for map centering + centroid
# fallback when the officer doesn't drop an exact pin.
DISTRICT_COORDS = {
    "Bagalkot": (16.1691, 75.6615), "Ballari": (15.1394, 76.9214),
    "Belagavi": (15.8497, 74.4977), "Bengaluru Urban": (12.9716, 77.5946),
    "Bengaluru Rural": (13.2846, 77.5750), "Bidar": (17.9106, 77.5199),
    "Chamarajanagar": (11.9236, 76.9456), "Chikkaballapur": (13.4355, 77.7315),
    "Chikkamagaluru": (13.3161, 75.7720), "Chitradurga": (14.2251, 76.3980),
    "Dakshina Kannada": (12.8703, 74.8806), "Davanagere": (14.4644, 75.9218),
    "Dharwad": (15.4589, 75.0078), "Gadag": (15.4315, 75.6355),
    "Hassan": (13.0072, 76.0962), "Haveri": (14.7935, 75.3999),
    "Kalaburagi": (17.3297, 76.8343), "Kodagu": (12.4218, 75.7382),
    "Kolar": (13.1367, 78.1292), "Koppal": (15.3547, 76.1548),
    "Mandya": (12.5223, 76.8954), "Mysuru": (12.2958, 76.6394),
    "Raichur": (16.2076, 77.3463), "Ramanagara": (12.7217, 77.2807),
    "Shivamogga": (13.9299, 75.5681), "Tumakuru": (13.3379, 77.1173),
    "Udupi": (13.3409, 74.7421), "Uttara Kannada": (14.8138, 74.1299),
    "Vijayapura": (16.8302, 75.7100), "Yadgir": (16.7700, 77.1376),
    "Vijayanagara": (15.2690, 76.3871),
}


# Representative police stations per district (HQ city stations + major
# taluk-town stations). Names reflect real areas/taluks for legitimacy.
POLICE_STATIONS = {
    "Bagalkot": ["Bagalkot Town", "Bagalkot Rural", "Badami", "Hungund",
                 "Jamkhandi", "Mudhol", "Bilagi", "Rabkavi Banhatti", "Guledgudda"],
    "Ballari": ["Ballari City", "Ballari Rural", "Cowl Bazar", "Sandur",
                "Siruguppa", "Kurugodu", "Toranagallu"],
    "Belagavi": ["Belagavi City", "Belagavi Rural", "Camp", "Market",
                 "Khanapur", "Bailhongal", "Gokak", "Chikkodi", "Athani",
                 "Ramdurg", "Saundatti", "Nippani", "Hukkeri"],
    "Bengaluru Urban": ["Koramangala", "Indiranagar", "Jayanagar", "Whitefield",
                        "MG Road", "Yelahanka", "Ashok Nagar", "Cubbon Park",
                        "Banashankari", "Electronic City", "K.R. Puram", "Hebbal",
                        "Marathahalli", "Basavanagudi", "Malleswaram",
                        "Vijayanagar", "Kengeri", "HSR Layout", "Madiwala",
                        "Halasuru Gate", "Sampigehalli", "Byatarayanapura"],
    "Bengaluru Rural": ["Devanahalli", "Hoskote", "Nelamangala", "Doddaballapura",
                        "Vijayapura Town", "Bashettihalli"],
    "Bidar": ["Bidar Town", "Bidar Rural", "Basavakalyan", "Bhalki", "Humnabad",
              "Aurad", "Chitguppa", "Kamalanagar"],
    "Chamarajanagar": ["Chamarajanagar Town", "Chamarajanagar Rural", "Gundlupet",
                       "Kollegal", "Yelandur", "Hanur"],
    "Chikkaballapur": ["Chikkaballapur Town", "Bagepalli", "Chintamani",
                       "Gauribidanur", "Gudibande", "Sidlaghatta"],
    "Chikkamagaluru": ["Chikkamagaluru Town", "Kadur", "Tarikere", "Mudigere",
                       "Sringeri", "Koppa", "Narasimharajapura", "Ajjampura"],
    "Chitradurga": ["Chitradurga Town", "Chitradurga Rural", "Challakere",
                    "Hiriyur", "Holalkere", "Hosadurga", "Molakalmuru"],
    "Dakshina Kannada": ["Mangaluru City", "Mangaluru Rural", "Barke", "Kadri",
                         "Ullal", "Surathkal", "Bantwal", "Puttur", "Sullia",
                         "Belthangady", "Moodabidri", "Kavoor"],
    "Davanagere": ["Davanagere City", "Davanagere Rural", "Harihar", "Channagiri",
                   "Honnali", "Jagalur", "Nyamati"],
    "Dharwad": ["Dharwad Town", "Dharwad Rural", "Hubballi City", "Hubballi Rural",
                "Gokul Road", "Vidyanagar", "Kalghatgi", "Kundgol", "Navalgund",
                "Alnavar"],
    "Gadag": ["Gadag Town", "Betageri", "Ron", "Naragund", "Shirhatti",
              "Mundargi", "Lakshmeshwar", "Gajendragad"],
    "Hassan": ["Hassan Town", "Hassan Rural", "Arsikere", "Channarayapatna",
               "Holenarasipura", "Sakleshpur", "Alur", "Belur", "Arkalgud"],
    "Haveri": ["Haveri Town", "Ranebennur", "Byadgi", "Hangal", "Hirekerur",
               "Savanur", "Shiggaon", "Rattihalli"],
    "Kalaburagi": ["Kalaburagi City", "Kalaburagi Rural", "Brahmapur", "Ashok Nagar",
                   "Afzalpur", "Aland", "Chincholi", "Chittapur", "Jevargi",
                   "Sedam", "Wadi", "Kamalapur"],
    "Kodagu": ["Madikeri Town", "Virajpet", "Somwarpet", "Kushalnagar",
               "Ponnampet", "Napoklu"],
    "Kolar": ["Kolar Town", "Kolar Rural", "Bangarpet", "Malur", "Mulbagal",
              "Srinivaspur", "K.G.F. (Robertsonpet)"],
    "Koppal": ["Koppal Town", "Gangavathi", "Kushtagi", "Yelburga",
               "Kanakagiri", "Karatagi"],
    "Mandya": ["Mandya Town", "Mandya Rural", "Maddur", "Malavalli",
               "Srirangapatna", "Nagamangala", "Pandavapura", "K.R. Pete"],
    "Mysuru": ["Mysuru City (Devaraja)", "Nazarbad", "Vijayanagar", "Kuvempunagar",
               "Krishnaraja", "Narasimharaja", "Lashkar", "K.R. Nagar", "Hunsur",
               "Piriyapatna", "T. Narasipura", "Nanjangud", "H.D. Kote"],
    "Raichur": ["Raichur City", "Raichur Rural", "Sadar Bazar", "Sindhanur",
                "Manvi", "Lingsugur", "Devadurga", "Maski"],
    "Ramanagara": ["Ramanagara Town", "Channapatna", "Kanakapura", "Magadi",
                   "Harohalli", "Bidadi"],
    "Shivamogga": ["Shivamogga City", "Shivamogga Rural", "Doddapet", "Bhadravathi",
                   "Sagar", "Shikaripura", "Sorab", "Hosanagara", "Thirthahalli"],
    "Tumakuru": ["Tumakuru Town", "Tumakuru Rural", "Tiptur", "Sira", "Madhugiri",
                 "Kunigal", "Gubbi", "Turuvekere", "Chikkanayakanahalli",
                 "Pavagada", "Koratagere"],
    "Udupi": ["Udupi Town", "Udupi Rural", "Malpe", "Kundapura", "Karkala",
              "Byndoor", "Kaup", "Brahmavara", "Hebri"],
    "Uttara Kannada": ["Karwar Town", "Karwar Rural", "Sirsi", "Kumta", "Bhatkal",
                       "Honnavar", "Ankola", "Dandeli", "Haliyal", "Yellapur",
                       "Mundgod", "Siddapur", "Joida"],
    "Vijayapura": ["Vijayapura City", "Vijayapura Rural", "Adarsh Nagar", "Indi",
                   "Basavana Bagewadi", "Sindagi", "Muddebihal", "Talikota",
                   "Nidagundi", "Devar Hippargi"],
    "Yadgir": ["Yadgir Town", "Shahapur", "Surpur (Shorapur)", "Gurmitkal",
               "Hunsagi", "Wadgera"],
    "Vijayanagara": ["Hosapete Town", "Hosapete Rural", "Kampli", "Kudligi",
                     "Hagaribommanahalli", "Kottur", "Harapanahalli",
                     "Huvina Hadagali"],
}
