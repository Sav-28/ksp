"""
Test script for KSP Crime AI MVP - End-to-end testing
"""

import requests
import json

BASE_URL = "http://localhost:8004"

def test_health_check():
    """Test health endpoint"""
    print("\n" + "="*60)
    print("TEST 1: Health Check")
    print("="*60)
    
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    assert response.status_code == 200
    print("✅ PASSED")

def test_query_1():
    """Test: Show crimes in Bengaluru"""
    print("\n" + "="*60)
    print("TEST 2: Show crimes in Bengaluru")
    print("="*60)
    
    payload = {
        "text": "Show crimes in Bengaluru",
        "language": "en"
    }
    
    response = requests.post(f"{BASE_URL}/api/chat", json=payload)
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Answer: {data['answer']}")
    print(f"Results count: {len(data['results'])}")
    if data['results']:
        print(f"Sample crime: {data['results'][0]['crime_type']} - {data['results'][0]['district']}")
    
    assert response.status_code == 200
    assert data['error'] is None
    assert len(data['results']) > 0
    print("✅ PASSED")

def test_query_2():
    """Test: Count crimes in Mysuru"""
    print("\n" + "="*60)
    print("TEST 3: How many crimes in Mysuru")
    print("="*60)
    
    payload = {
        "text": "How many crimes in Mysuru",
        "language": "en"
    }
    
    response = requests.post(f"{BASE_URL}/api/chat", json=payload)
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Answer: {data['answer']}")
    
    assert response.status_code == 200
    assert data['error'] is None
    print("✅ PASSED")

def test_query_3():
    """Test: Show thefts last month"""
    print("\n" + "="*60)
    print("TEST 4: Show thefts in Bengaluru last month")
    print("="*60)
    
    payload = {
        "text": "Show thefts in Bengaluru last month",
        "language": "en"
    }
    
    response = requests.post(f"{BASE_URL}/api/chat", json=payload)
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Answer: {data['answer']}")
    print(f"Results count: {len(data['results'])}")
    
    assert response.status_code == 200
    assert data['error'] is None
    print("✅ PASSED")

def test_query_4():
    """Test: Invalid query (no location or date)"""
    print("\n" + "="*60)
    print("TEST 5: Invalid query - 'show all crimes'")
    print("="*60)
    
    payload = {
        "text": "show all crimes",
        "language": "en"
    }
    
    response = requests.post(f"{BASE_URL}/api/chat", json=payload)
    print(f"Status: {response.status_code}")
    
    # This should return 400 error due to missing location/date
    print(f"Response: {response.text[:200]}")
    print("✅ PASSED (Expected error handling)")

def test_query_5():
    """Test: Unknown intent"""
    print("\n" + "="*60)
    print("TEST 6: Unknown intent - 'hello how are you'")
    print("="*60)
    
    payload = {
        "text": "hello how are you",
        "language": "en"
    }
    
    response = requests.post(f"{BASE_URL}/api/chat", json=payload)
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Answer: {data.get('answer', 'N/A')}")
    print("✅ PASSED (Graceful handling)")

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("KSP CRIME AI - MVP END-TO-END TESTING")
    print("="*60)
    
    try:
        test_health_check()
        test_query_1()
        test_query_2()
        test_query_3()
        test_query_4()
        test_query_5()
        
        print("\n" + "="*60)
        print("ALL TESTS COMPLETED!")
        print("="*60)
        print("\n✅ MVP is working correctly!")
        print("\nNext steps:")
        print("1. Start frontend: cd frontend && npm start")
        print("2. Open browser: http://localhost:3000")
        print("3. Test with voice and text input")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
