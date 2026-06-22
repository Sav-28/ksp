"""
Test script to verify all 154 records are returned when querying
"""
import requests
import json

# Test the /chat endpoint
url = "http://localhost:8004/api/chat"
payload = {
    "text": "Show all crimes in Karnataka",
    "language": "en"
}

print("Testing: Show all crimes in Karnataka")
print("=" * 60)

response = requests.post(url, json=payload)
data = response.json()

print(f"\nStatus Code: {response.status_code}")
if response.status_code != 200:
    print(f"Error: {data}")
print(f"Answer: {data.get('answer', 'N/A')}")
print(f"\nNumber of results returned: {len(data.get('results', []))}")
print(f"Total records in database: 154")

if len(data.get('results', [])) == 154:
    print("\n✅ SUCCESS! All 154 records are being returned!")
elif len(data.get('results', [])) == 100:
    print("\n❌ ISSUE: Only 100 records returned (old limit)")
else:
    print(f"\n⚠️  Unexpected: {len(data.get('results', []))} records returned")

# Show first 3 and last 3 records
results = data.get('results', [])
if results:
    print(f"\nFirst 3 records:")
    for i in range(min(3, len(results))):
        r = results[i]
        print(f"  {i+1}. {r.get('crime_type')} - {r.get('district')} - FIR: {r.get('fir_number')}")
    
    print(f"\nLast 3 records:")
    for i in range(max(0, len(results)-3), len(results)):
        r = results[i]
        print(f"  {i+1}. {r.get('crime_type')} - {r.get('district')} - FIR: {r.get('fir_number')}")
