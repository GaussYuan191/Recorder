/******************
《【教程】实时多路音频混音》
作者：高坚果
时间：2020-1-2 18:19:43

通过onProcess回调可实现实时的多路音频混音处理，简单的将其他音频pcm叠加到当前buffers中实现混音；另外直接修改buffers将内容数据统统设置为0即可实现静音效果。
******************/
var musics=[];//混音BGM素材列表
var musicBGs={};//音效素材列表
var musicPercent=1/3;//混音素材音量降低这么多，免得把主要的录音混的听不清

//*****简单混音*******
var Mix=function(buffer,sampleRate,mute,bgm,posFloat,loop){
	var step=bgm.sampleRate/sampleRate;
	var curInt=-1,sum=0;
	for(var j=0;j<buffer.length;j++){		
		if(mute){
			buffer[j]=0;//置为0即为静音
		};
		
		var cur=Math.floor(posFloat);
		if(cur>curInt){
			var data_mix,data1=buffer[j],data2=(bgm.pcm[cur]||0)*musicPercent;
			
			//简单混音算法 https://blog.csdn.net/dancing_night/article/details/53080819
			if(data1<0 && data2<0){
				data_mix = data1+data2 - (data1 * data2 / -(Math.pow(2,16-1)-1));  
			}else{
				data_mix = data1+data2 - (data1 * data2 / (Math.pow(2,16-1)-1));
			};
			
			buffer[j]=data_mix;
		};
		curInt=cur;
		posFloat+=step;
		if(loop && posFloat>=bgm.pcm.length){
			posFloat=0;
			curInt=-1;//洗脑循环 直接回到开头可否 ????
		};
		
		sum+=Math.abs(buffer[j]);
	};
	return {pos:posFloat,sum:sum};
};
var mixProcess=function(buffers,sampleRate,chunk){
	var idx=chunk.idx||0;
	for(;idx<buffers.length;idx++){
		mixProcessWork(buffers[idx],sampleRate,chunk)
	};
	chunk.idx=idx;
	return chunk;
};
var mixProcessWork=function(buffer,sampleRate,chunk){
	if(loadWait){
		console.log("素材还在加载");
		return;
	};
	
	//新建一个空白音轨
	var bgmBuffer=new Int16Array(buffer.length);
	
	//将所有music混入到bgmBuffer中
	var poss=chunk.poss||[];
	chunk.poss=poss;
	if(!voiceSet.muteBGM){
		for(var i=0;i<musics.length;i++){
			poss[i]=Mix(bgmBuffer,sampleRate,false,musics[i],poss[i]||0,true).pos;
		};
	};
	//将所有音效混入到bgmBuffer中
	var bgms=voiceSet.bgms||[];
	for(var i=0;i<bgms.length;i++){
		var bgm=musicBGs[bgms[i].key];
		var pos=Mix(bgmBuffer,sampleRate,false,bgm,bgms[i].pos||0,false).pos;
		bgms[i].pos=pos;
		
		//此音效已混完
		if(pos>=bgm.pcm.length){
			bgms.splice(i,1);
			i--;
		};
	};
	
	//播放bgmBuffer，录制端能听到实时bgm反馈
	playBuffer(chunk,bgmBuffer,sampleRate);
	
	//将bgmBuffer混入buffer中
	var info=Mix(buffer,sampleRate,voiceSet.mute,{pcm:bgmBuffer,sampleRate:sampleRate},0,false);
	
	chunk.powerLevel=Recorder.PowerLevel(info.sum,buffer.length);
};
var playBuffer=function(chunk,buffer,sampleRate){
	var size=chunk.playSize||0;
	var arr=chunk.playArr||[];
	var st=sampleRate/1000*300;//缓冲播放，不然间隔太短接续爆音明显
	
	size+=buffer.length;
	arr.push(buffer);
	if(size>=st){
		var ctx=Recorder.Ctx;
		var audio=ctx.createBuffer(1,size,sampleRate);
		var channel=audio.getChannelData(0);
		var sd=sampleRate/1000*2;//2ms的淡入淡出 大幅减弱爆音
		for(var j=0,idx=0;j<arr.length;j++){
			var buf=arr[j];
			for(var i=0,l=buf.length,buf_sd=l-sd;i<l;i++){
				var factor=1;//淡入淡出因子
				if(i<sd){
					factor=i/sd;
				}else if(i>buf_sd){
					factor=(l-i)/sd;
				};
				
				channel[idx++]=buf[i]/0x7FFF*factor;
			};
		};
		var source=ctx.createBufferSource();
		source.channelCount=1;
		source.buffer=audio;
		source.connect(ctx.destination);
		source.start();
		
		size=0;
		arr=[];
	};
	chunk.playSize=size;
	chunk.playArr=arr;
};

var voiceSet={};
var muteChange=function(bgm){
	if(!rec){
		Runtime.Log("未开始混音",1);
		return
	};
	bgm=bgm||"";
	voiceSet["mute"+bgm]=!voiceSet["mute"+bgm];
	$(".mixBtn-mute"+bgm)[voiceSet["mute"+bgm]?"removeClass":"addClass"]("mixMinBtnOff");
};
var bgmSet=function(bgm){
	if(!rec){
		Runtime.Log("未开始混音",1);
		return
	};
	var bgms=voiceSet.bgms=voiceSet.bgms||[];
	bgms.push({key:bgm});
};



//******音频数据源，采集原始音频用的******
//显示控制按钮
Runtime.Ctrls([
	{name:"开始混音",click:"recStart"}
	,{name:"结束混音",click:"recStop"}
	
	,{html:'<hr/><div style="margin-bottom:8px;font-size:12px">音效控制\
<style>\
.mixMinBtn{\
	height: 30px;\
	line-height: 30px;\
	padding: 0 10px;\
	font-size: 13px;\
}\
.mixMinBtnOff{\
	background:#999;\
}\
</style>\
</div>'}
	
	,{name:"麦克风静音",click:"muteChange",cls:"mixMinBtn mixMinBtnOff mixBtn-mute"}
	,{name:"BGM静音",click:"muteChange('BGM');Date.now",cls:"mixMinBtn mixMinBtnOff mixBtn-muteBGM"}
	,{name:"爆笑音效",click:"bgmSet('xiao');Date.now",cls:"mixMinBtn mixMinBtnOff mixBtn-xiao"}
	,{name:"晕倒音效",click:"bgmSet('yun');Date.now",cls:"mixMinBtn mixMinBtnOff mixBtn-yun"}
	,{name:"转场音效",click:"bgmSet('scene');Date.now",cls:"mixMinBtn mixMinBtnOff mixBtn-scene"}
]);


//加载录音框架
Runtime.Import([
	{url:RootFolder+"/src/recorder-core.js",check:function(){return !window.Recorder}}
	,{url:RootFolder+"/src/engine/mp3.js",check:function(){return !Recorder.prototype.mp3}}
	,{url:RootFolder+"/src/engine/mp3-engine.js",check:function(){return !Recorder.lamejs}}
]);


//调用录音
var rec;
function recStart(){
	voiceSet={};
	$(".mixMinBtn").addClass("mixMinBtnOff");
	var mixChunk={};
	
	rec=Recorder({
		type:"mp3"
		,sampleRate:32000
		,bitRate:96
		,onProcess:function(buffers,powerLevel,bufferDuration,bufferSampleRate){
			mixChunk=mixProcess(buffers,bufferSampleRate,mixChunk);
			powerLevel=mixChunk.powerLevel;
			
			Runtime.Process(buffers,powerLevel,bufferDuration,bufferSampleRate);
		}
	});
	var t=setTimeout(function(){
		Runtime.Log("无法录音：权限请求被忽略（超时假装手动点击了确认对话框）",1);
	},8000);
	
	rec.open(function(){//打开麦克风授权获得相关资源
		clearTimeout(t);
		rec.start();//开始录音
	},function(msg,isUserNotAllow){//用户拒绝未授权或不支持
		clearTimeout(t);
		Runtime.Log((isUserNotAllow?"UserNotAllow，":"")+"无法录音:"+msg, 1);
	});
};
function recStop(){
	rec.stop(function(blob1,duration1){
		//因为是mp3格式录音，buffers编码引擎内部的buffer，因此rec.buffers未被篡改
		var pcm=Recorder.SampleData(rec.buffers,rec.srcSampleRate,rec.srcSampleRate);
		rec.mock(pcm.data,rec.srcSampleRate);
		rec.stop(function(blob2,duration2){
			Runtime.LogAudio(blob2,duration2,rec,"原始录音");
			Runtime.LogAudio(blob1,duration1,rec,"混音结果");
			rec=null;
		},function(msg){
			Runtime.Log("生成原始音频失败:"+msg, 1);
		});
	},function(msg){
		Runtime.Log("录音失败:"+msg, 1);
	},1);
};


//*****拖拽或者选择文件******
$(".choiceFileBox").remove();
Runtime.Log('<div class="choiceFileBox">\
	<div class="dropFile" onclick="$(\'.choiceFile\').click()" style="border: 3px dashed #a2a1a1;background:#eee; padding:30px 0; text-align:center;cursor: pointer;">\
	拖拽多个音乐文件到这里 / 点此选择，替换混音BGM\
	</div>\
	<input type="file" class="choiceFile" style="display:none" accept="audio/*" multiple="multiple">\
</div>');
$(".dropFile").bind("dragover",function(e){
	e.preventDefault();
}).bind("drop",function(e){
	e.preventDefault();
	
	readChoiceFile(e.originalEvent.dataTransfer.files);
});
$(".choiceFile").bind("change",function(e){
	readChoiceFile(e.target.files);
});
function readChoiceFile(files){
	if(!files.length){
		return;
	};
	
	Runtime.Log("发现"+files.length+"个文件，开始替换素材...");
	loadWait=0;
	musics=[];
	
	var idx=-1;
	var run=function(){
		idx++;
		if(idx>=files.length){
			Runtime.Log("素材替换完毕，可以开始录音了",2);
			return;
		};
		
		var file = files[idx];
		var reader = new FileReader();
		reader.onload = function(e){
			decodeAudio(file.name,e.target.result,run);
		}
		reader.readAsArrayBuffer(file);
	};
	run();
};



//*****加载和解码素材********
var loadWait=0;
var load=function(name,bgName,call){
	Runtime.Log("开始加载混音音频素材"+name+"，请勿操作...");
	loadWait++;
	var xhr=new XMLHttpRequest();
	xhr.onloadend=function(){
		if(xhr.status==200){
			loadWait--;
			decodeAudio(name,xhr.response,call,bgName);
		}else{
			Runtime.Log("加载音频失败["+xhr.status+"]:"+name,1);
		};
	};
	xhr.open("GET",RootFolder+"/assets/audio/"+name,true);
	xhr.timeout=16000;
	xhr.responseType="arraybuffer";
	xhr.send();
};
var decodeAudio=function(name,arr,call,bgName){
	if(!Recorder.Support()){//强制激活Recorder.Ctx 不支持大概率也不支持解码
		Runtime.Log("浏览器不支持音频解码",1);
		return;
	};
	var srcBlob=new Blob([arr],{type:"audio/"+(/[^.]+$/.exec(name)||[])[0]});
	var ctx=Recorder.Ctx;
	ctx.decodeAudioData(arr,function(raw){
		var src=raw.getChannelData(0);
		var sampleRate=raw.sampleRate;
		console.log(name,raw,srcBlob);
		
		var pcm=new Int16Array(src.length);
		for(var i=0;i<src.length;i++){//floatTo16BitPCM 
			var s=Math.max(-1,Math.min(1,src[i]));
			s=s<0?s*0x8000:s*0x7FFF;
			pcm[i]=s;
		};
		
		Runtime.LogAudio(srcBlob,Math.round(src.length/sampleRate*1000),{set:{sampleRate:sampleRate}},"已解码"+name);
		if(bgName){
			musicBGs[bgName]={pcm:pcm,sampleRate:sampleRate};
		}else{
			musics.push({pcm:pcm,sampleRate:sampleRate});
		};
		call();
	},function(e){
		Runtime.Log("audio解码失败:"+e.message,1);
	});
};
var loadAll=function(){
	load("music-阿刁-张韶涵.mp3",0,function(){
		load("music-在人间-张韶涵.mp3",0,function(){
			load("bgm-爆笑.mp3","xiao",function(){
				load("bgm-晕倒.mp3","yun",function(){
					load("bgm-转场.mp3","scene",function(){
						Runtime.Log("待混音音频素材已准备完毕，可以开始录音了",2);
					});
				});
			});
		});
	});
};

//加载素材
setTimeout(loadAll);