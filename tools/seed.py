import json,base64,urllib.request,sys
kinds=['a_whale','a_seahorse','a_crab','a_manta','a_shark','a_angel','a_turtle','a_octopus','a_jelly','a_dolphin']
def post(kind,i):
    png='data:image/png;base64,'+base64.b64encode(open(f'/tmp/cut_{i}.png','rb').read()).decode()
    r=urllib.request.Request('http://localhost:8000/api/fish',data=json.dumps({'kind':kind,'png':png}).encode(),headers={'Content-Type':'application/json','X-Reef':'1'})
    return json.loads(urllib.request.urlopen(r).read())
for i,k in enumerate(kinds[:int(sys.argv[1]) if len(sys.argv)>1 else 10]): print(post(k,i)['name'],end=' ')
print()
