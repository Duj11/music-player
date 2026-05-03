const importContainer = document.querySelector(".import-container");
const audioDisplayContainer = document.querySelector(".audio-display-container");
const libraryContainer = document.querySelector(".library-container");
const library = document.querySelector(".library");
const audioInput = document.getElementById("audio-input");
let records = []; 
let currentAudio = null;
let selectedAlbum = null;
let selectedTrackIndex = 0;

async function init(){
  records = await loadRecords();
  if(records.length){
    displayLibrary();
  }
}

init();

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MusicDB", 1);

    request.onupgradeneeded = function(e) {
      const db = e.target.result;

      if(!db.objectStoreNames.contains("songs")){
        db.createObjectStore("songs", {
          keyPath: "id"
        });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error)
  } )
}

async function saveRecord(record){
  const db = await openDB();
  return new Promise((resolve,reject) => {
    const tx = db.transaction("songs", "readwrite");
    const store = tx.objectStore("songs");
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error)
  })

}

async function loadRecords(){
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("songs", "readonly");
    const store = tx.objectStore("songs");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  })
}

function getCover(album) {
  return album.track[0].fetchedMetaData?.album?.image?.[
    album.track[0].fetchedMetaData.album.image.length - 1
  ]?.["#text"] || "/assets/placeholder.jpg";
}


function updateNowPlaying() {

  const nowPlaying = document.querySelector(".now-playing");
  if (!selectedAlbum) {
    nowPlaying.textContent = "";
    return
  };

  const trackAlbum = selectedAlbum.name || "Unkown";
  const trackName = selectedAlbum.track[selectedTrackIndex]?.fetchedMetaData?.name || "Unknown";
  const trackArtist = selectedAlbum.track[selectedTrackIndex]?.fetchedMetaData?.artist.name || "Unknown";

  nowPlaying.textContent = `${trackArtist} - ${trackName} | ${trackAlbum}`;
}

function playCurrentTrack() {
  if (!selectedAlbum) {
    return
  };

  const file = selectedAlbum.track[selectedTrackIndex].importedAudio;

  if (currentAudio) {
    currentAudio.pause();
  }

  currentAudio = new Audio(
    URL.createObjectURL(file)
  );

  currentAudio.datasetAlbum = selectedAlbum.name;
  currentAudio.play();

  updateNowPlaying();

  currentAudio.onended = () => {
    selectedTrackIndex++;

    if (selectedTrackIndex < selectedAlbum.track.length) {
      playCurrentTrack();
    } else {
      currentAudio = null;
      selectedTrackIndex = 0;
      updateNowPlaying();
      const disc = document.querySelector(".audio-display-container .disc");
     disc.classList.remove("disc-playing");
    }
  };
}

function renderMainAlbum(album) {
  audioDisplayContainer.innerHTML = `
    <div class="album-cover" id="${album.name}">
      <img src="${getCover(album)}" width="300" height="300">

      <div class="disc">
        <div class="internal-disc">
          <img src="${getCover(album)}" width="300" height="300">
        </div>
      </div>
    </div>
  `;

  updateNowPlaying(); 
}

function displayLibrary(){
  library.innerHTML = ""
  libraryContainer.style.display = "flex";
  audioDisplayContainer.style.display = "flex";
  importContainer.style.display = "none";

  records.forEach((album) => {
    library.innerHTML += `
      <div class="album-cover" id="${album.name}">
        <img src="${getCover(album)}" width="300" height="300">
      </div>
    `;
  });

  if (!selectedAlbum && records.length) {
    selectedAlbum = records[records.length - 1];
    renderMainAlbum(selectedAlbum);
  }
}

async function logAudioFile(tag, audioFile) {

  const album = {};
  album.track = []
  const record = {};

  try {
    const myKey = 'a4933d1a39dcce685816bf5c8330fa5b';
    const response = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${myKey}&artist=${tag.tags.artist}&track=${tag.tags.title}&format=json&autocorrect=1`
    );
    const data = await response.json();
    
    record.importedAudio = audioFile;
    record.fetchedMetaData = data.track;
    album.id = crypto.randomUUID();
    
    const sameAlbum = records.some(album => Object.values(album).includes(tag.tags.album));
    if(sameAlbum){
     
      const alreadyExists = records.some(album => album.track.some(record => record.fetchedMetaData?.name === data.track.name));
     
      if(alreadyExists){
        return;
      }

      for (const existingAlbum of records) {
        if (existingAlbum.name === tag.tags.album) {
          existingAlbum.track.push(record);
          await saveRecord(existingAlbum);
          break;
        }
      }
      displayLibrary()
    }else{
      album.name = tag.tags.album;
      album.track.push(record);
      records.push(album)
      await saveRecord(album);
      displayLibrary()
    }
    
  } catch (error) {
    console.error(error);
  }
}

audioInput.addEventListener("change", (e)=>{

  if(audioInput.files.length > 1){
    [...audioInput.files].forEach((audioFile) => {
      window.jsmediatags.read(audioFile, {
      onSuccess: function(tag) {
        logAudioFile(tag, audioFile)
      },
      onError: function(error) {
      }}); 
    })
  }else{
    window.jsmediatags.read(audioInput.files[0], {
    onSuccess: function(tag) {
      logAudioFile(tag, audioInput.files[0])
    },
    onError: function(error) {
  }}); 
  }
})

library.addEventListener("click", (e) => {
  const cover = e.target.closest(".album-cover");
  if (!cover) {
    return
  };

  const newAlbum = records.find(album => album.name === cover.id);
  if (!newAlbum) {
    return
  };

  if (currentAudio && selectedAlbum?.name !== newAlbum.name) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  selectedAlbum = newAlbum;
  selectedTrackIndex = 0; 

  renderMainAlbum(selectedAlbum);
});

audioDisplayContainer.addEventListener("click", (e) => {

  const clickedCover = e.target.closest(".album-cover");
  const clickedDisc = e.target.closest(".disc");

  if (!clickedCover && !clickedDisc) return;
  if (!selectedAlbum) return;

  const coverImg =
    document.querySelector(".audio-display-container .album-cover > img");

  const disc =
    document.querySelector(".audio-display-container .disc");

  coverImg.classList.add("cover-slide");
  disc.classList.add("disc-playing");
  clickedCover.classList.add("container-slide")
  if (!currentAudio || currentAudio.datasetAlbum !== selectedAlbum.name) {
    playCurrentTrack();
    return;
  }

  if (currentAudio.paused) {
    currentAudio.play();
    disc.style.animationPlayState = "running";
  } else {
    currentAudio.pause();
    disc.style.animationPlayState = "paused";
  }
});