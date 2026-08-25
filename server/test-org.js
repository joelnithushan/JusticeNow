async function runTests() {
  const fetchApi = async (path) => {
    const res = await fetch(`http://localhost:5000/api${path}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  try {
    console.log('1. Test all organisations');
    let res = await fetchApi('/organisations');
    console.log(`Found: ${res.data.length}`);

    console.log('\n2. Test district filter (Colombo)');
    res = await fetchApi('/organisations?district=Colombo');
    console.log(`Found: ${res.data.length}`);
    
    console.log('\n3. Test case_type filter (harassment)');
    res = await fetchApi('/organisations?case_type=harassment');
    console.log(`Found: ${res.data.length}`);
    
    console.log('\n4. Test search filter (name)');
    res = await fetchApi('/organisations?search=Legal');
    console.log(`Found: ${res.data.length}`);
    
    console.log('\n5. Test combination (Colombo + harassment)');
    res = await fetchApi('/organisations?district=Colombo&case_type=harassment');
    console.log(`Found: ${res.data.length}`);
    
    console.log('\n6. Test empty state (Invalid search string)');
    res = await fetchApi('/organisations?search=zzxxccvvbb');
    console.log(`Found: ${res.data.length}`);
  } catch (err) {
    console.error(err);
  }
}

runTests();
