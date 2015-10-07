
// Copyright 2015 yejianfei. All rights reserved.
// Use of this source code is governed by a MIT-style
// license that can be found in the LICENSE file.

'use strict';

var settings = require('./config.js').settings,
	http = require('http'),
	crypto = require('crypto'),
	fs = require('fs-extra'),
	url = require('url'),
	util = require('util'),
	path = require('path'),
	sharp = require('sharp'),
	formidable = require('formidable'),
	redis = require('redis-connection-pool')('redis',settings.redis),
	sub = require('redis').createClient(settings.redis.port, settings.redis.host,settings.redis.options),
	mongo = require('mongodb'),
	mongoserver = new mongo.Server(settings.mongo.host, settings.mongo.port, settings.mongo.options),
	db = new mongo.Db(settings.mongo.db, mongoserver, {})


/**
* 获取请求地址中的mongodb collection名称，如果不在允许配置settings.allowBuckets列表中，
* 返回null。示例如下：
*
* /images
* images = mongodb collection
* 
* @param req http 请求对象
*
**/
function getBucket(req) {
	var url = req.url.substring(1);
	var bucket = url.substring(0,url.indexOf('/'));
	if(bucket == ""){
		bucket = url;
	}

	for(var i = 0; i < settings.allowBuckets.length; i++){
		if(bucket == settings.allowBuckets[i]){
			return bucket;
		}
	}

	return null;
}

/**
* 获取请求地址中的文件名称。示例如下：
*
* /images/77f051a7865acf008921790b6bd3b724.jpg
* 77f051a7865acf008921790b6bd3b724.jpg = 文件名称
* 
* @param req http 请求对象
*
**/
function getFileName(req) {
	var url = req.url.substring(1);
	var name = url.substring(url.indexOf('/') + 1, url.length);

	if(name.lastIndexOf('_') > 0){
		name = name.substring(0, name.lastIndexOf('_'))
				+ name.substring(name.lastIndexOf('.'),name.length);
	}

	return name;
}

/**
* 获取请求地址中的文件缩放尺寸配置。示例如下：
*
* /images/77f051a7865acf008921790b6bd3b724_S.jpg
* s = 文件缩放尺寸配置名称。
* 
* @param req http 请求对象
*
**/
function getFileSize(req) {

	if(req.url.lastIndexOf('_') < 0) {
		return null;
	} else {
		return req.url.substring(req.url.lastIndexOf('_') + 1, req.url.lastIndexOf('.'));
	}
} 

/**
* 使用真实文件名称及当前时间进行哈希，生成唯一的文件名。
*
* @param name 真实文件名
* 
**/
function genFileId(name) {
	var suffix = name.substring(name.lastIndexOf('.') + 1, name.length);

	return crypto.createHash('md5')
				.update([new Date().getTime(),name].join('/'))
				.digest('hex') + '.' + suffix;
}

/**
* 获取请求地址中的元信息文件名称，由于元信息文件与上传文件同名，只是后缀不同，示例如下：
*
* /images/77f051a7865acf008921790b6bd3b724.jpg
* 77f051a7865acf008921790b6bd3b724.jpg = 77f051a7865acf008921790b6bd3b724.meta
* 
* @param req http 请求对象
*
**/
function getMetaFileName(req) {
	var name = getFileName(req);
	return name.substring(0, name.lastIndexOf('.')) + '.meta';
}

/**
* 返回http 404结果响应。
*
* @param resp http 相应对象
*
**/
function endWithNotFound(resp){
	resp.writeHead(404, {'Content-Type': 'text/plain'});
	resp.end();	
}

/**
* 对返回的图像文件，根据请求缩放配置名称进行缩放处理，如果没有找到配置项目、请求中没有说明缩放参数、参数设置
* 不符合格式要求等，都直接返回原始文件，同时可以通过参数忽略缩放操作。缩放配置参考：settings.resize
* 
* @param data 原始文件流
* @param size 缩放配置名称
* @param ignore 手动忽略缩放，用于外部统一排除不支持的文件类型
* @param callback 缩放完成后回调方法
*
**/
function resize(data,size,ignore,callback) {

	if(!ignore && size && settings.resize[size]) {
		var width = parseInt(settings.resize[size].substring(0,settings.resize[size].indexOf('x')));
		var height = parseInt(settings.resize[size].substring(settings.resize[size].indexOf('x') + 1, settings.resize[size].length));

		if(width == 0 || isNaN(width) || height == 0 || isNaN(height)){
			resize(data,null,callback);
		} else {
			sharp(data).resize(width,height).toBuffer(function(err, buffer, info){
				callback.call(this,err,buffer,info);
			});
		}

	} else {
		callback.call(this,null,data,{});
	}

}

/**
* 处理获取文件片请求,使用请求地址解析需要访问文件的mongodb collection，及要访问的文件名称，同时该
* 方法在mongodb查找不到所请求的文件时，会在settings.tmpdir定义的临时目录中查找文件，如果临时文件
* 也过期了，返回响应404，找到文件时会根据请求地址参数进行缩放操作。请求地址示例如下：
*
* /images/77f051a7865acf008921790b6bd3b724_M.jpg
* images = mongodb collection
* 77f051a7865acf008921790b6bd3b724.jpg = 访问文件名称
* M = 缩放尺寸配置说明
*
* @param req http 请求对象
* @param resp http 相应对象
*
**/
function doGet(req, resp) {
	var size = getFileSize(req);
	var bucket = getBucket(req);
	var name = getFileName(req);
	var meta = settings.tmpdir + '/' + getMetaFileName(req);
	var file_path = settings.tmpdir + '/' + name;

	var store = new mongo.GridStore(db,name,"r",{'root':getBucket(req)});

	if(name == null || name == ''){
		endWithNotFound(resp);
		return;
	}

	store.open(function(err, gfs) {
	
		//读取mongodb文件失败，尝试在临时目录中查找文件。
		if(err){
			if(!fs.existsSync(file_path)){
				//临时文件同样查找文件失败，返回404
				endWithNotFound(resp);
			} else {
				//找到临时文件，先读取元信息文件，用于写入 response head。
				fs.readFile(meta,function(err, text) {
					var data = JSON.parse(text);

					//检测文件类型是否支持缩放。
					var supported = data.content_type == 'image/jpeg' || data.content_type == 'image/png'
					//同步读取文件内容，并进行自动缩放操作。
					resize(fs.readFileSync(file_path),size,supported,function(err, buffer, info) {
						var head = {
							'Content-Type': data.content_type,
							'Content-Length':info.size || data.file_size
						};

						//返回文件内容
						resp.writeHead(200, head);
						resp.end(buffer);

					});
				});
			}

			store.close();

		} else {

			//从mongodb里读取文件
			gfs.read(function(err, data){
				//检测文件类型是否支持缩放。
				var supported = data.content_type == 'image/jpeg' || data.content_type == 'image/png'

				//并进行自动缩放操作。
				resize(data,size,supported,function(err, buffer, info) {
					var head = {
						'Content-Type': gfs.contentType,
						'Content-Length':info.size || gfs.length
					};

					//返回文件内容
					resp.writeHead(200, head);
					resp.end(buffer);

					store.close();
				});

			});
		}

	});

}

/**
* 处理提交临时文件或其他操作的请求，目前只实现了提交文件功能，提交文件就是把存储在settings.tmpdir定义的临时
* 目录中的文件，放入GridFS中进行永久的存储。同时删除临时释放空间。提交请求采用HTTP PUT请求完成，并根据请求
* 地址来确定需要访问的集合名称，及文件名称。请求示例如下：
* 
* $.ajax('/images/77f051a7865acf008921790b6bd3b724.jpg',{
* 			'method' : 'PUT'
* });
* 
* images = mongodb collection
* 77f051a7865acf008921790b6bd3b724.jpg = commit file name
* 
* @param req http 请求对象
* @param resp http 相应对象
* 
**/
function doPut(req, resp) {

	var bucket = getBucket(req);
	var name = getFileName(req);
	var meta = settings.tmpdir + '/' + getMetaFileName(req);
	var file_path = settings.tmpdir + '/' + name;

	//如果临时文件还存在于settings.tmpdir定义的临时目录中，就进行提交操作。
	if(fs.existsSync(file_path) && fs.existsSync(meta)) {

		//读取元信息文件
		fs.readFile(meta,function(err, text) {
			var data = JSON.parse(text);
			var file = fs.readFileSync(file_path);

			var store = new mongo.GridStore(db,new mongo.ObjectID(), name,"w", {
						'root':bucket,
						'content_type':data.content_type

			});

			store.open(function(err, gfs) {
				
				gfs.writeFile(file_path, function(err, doc) {
					
					//写入至GridFS后，删除临时文件。
					fs.unlink(meta, function(err){
						fs.unlink(settings.tmpdir + '/' + name, function(){
						});
					});


					store.close();

					//返回操作操作成功。
					resp.writeHead(200, {'content-type': 'application/json'});
					resp.end(JSON.stringify({'success':true}));
				});
			});

		});

	} else {//已经不存于settings.tmpdir定义的临时目录中了，返回404
		endWithNotFound(resp);
	}


}

/**
* 处理上传文件请求（上传文件使用multipart/form-data方式上传），文件上传后先放入临时目录中存储，存储路径
* 根据settings.tmpdir配置项定义。文件名称采用当前时间进行哈希操作，保证文件名称的唯一性，同时生成一份元
* 信息文件，记录文件上传时的文件名称（raw_name）、文件类型（content_type）、文件大小（file_size）、
* 哈希名称（file_name）。元信息文件名与哈希文件名相同，但采用.meta为后缀。生产元信息文件后，使用哈希文件
* 名作为键存储Redis服务中，并根据settings。tmpTimeout配置项设置该键的过期时间。请求示例如下：
*
* <form method="post" enctype="multipart/form-data" target="fbrowser" action="/images">
* 	<input value="iframe" name="mode" />
*	<input type="file" name="file" />
* </form>
* <iframe name="fbrowser"></iframe>
*
* images = mongodb collection
*
* @param req http 请求对象
* @param resp http 相应对象
* 
**/
function doPost(req, resp) {

	var form = new formidable.IncomingForm();

	//解析表单数据，获取上次文件的相关信息。
    form.parse(req, function(err, fields, files) {
    	if(files.file) {

    		var name = files.file.name;
    		//使用当前时间哈希文件名，避免重复。
    		var file_id = genFileId(name); 

    		//生产文件元数据信息。
			var data = {
    			'file_name':file_id,
    			'file_size':files.file.size,
    			'raw_name':files.file.name,
    			'content_type':files.file.type
    		};

    		//从系统临时文件中，拷贝上传文件至settings.tmpdir配置项定义的目录中。
	    	fs.copy(files.file.path, settings.tmpdir + '/' + file_id, function (err) {

	    		//使用哈希文件中作为键，存储Redis中，并根据settings.tmpdir设置键的过期时间。
				redis.set(file_id,files.file.type,function(){
	    			redis.expire(file_id, settings.tmpTimeout);
	    		});

				//保持元信息文件至settings.tmpdir配置项定义的目录中。
	    		var meta = settings.tmpdir + '/' + file_id.substring(0, file_id.lastIndexOf('.')) + '.meta';
	    		fs.writeFileSync(meta, JSON.stringify(data, null, 4));

	    		//如果是采用iframe方式进行返回结果的，输出iframe的文件内容，设置window.data为返回结果。
			 	if('iframe' == fields.mode) {

					resp.writeHead(200, {'content-type': 'text/html'});
					resp.write([
						'<html>',
							'<head>',
								'<script type="text/javascript">',
									'document.domain = "' + settings.domain + '";',
									'window.data = ' + JSON.stringify(data) + ';',
								'</script>',
							'</head>',
						'</html>'
					].join(''));

					resp.end();
			 	} else { //使用httpclient方式上传，返回JSON结果。
					resp.writeHead(200, {'content-type': 'application/json;charset=UTF-8'});
					resp.end(JSON.stringify(data));
				}

			});
    	} else { //没有上传任何文件返回 406

        		resp.writeHead(406, {'Content-Type': 'text/plain'});
        		resp.end();
    	}

    });

}
//创建HTTP服务对象。
var server = http.createServer(function(req, resp){

	//处理实例页面及客户端脚本请求，直接返回对应的静态文件。
	if('/demo.html' == req.url || '/fbrowser.js' == req.url) {

		fs.readFile('./demo/' + url.parse(req.url).pathname, 'binary', function(err, file) {
			
			if(err) {
				//读取文件错误返回，HTTP 500
				resp.writeHead(500, {'Content-Type': 'text/plain'});
				resp.end();
			} else {
				//读取成功返回文件内容。
				resp.writeHead(200, {'Content-Type': 'text/html'});
				resp.write(file, 'binary');
				resp.end();
			}
		});
	} else {

		//如果请求的文件集合，不存在与配置文件中所允许的（settings.allowBuckets），返回HTTP 400
		var bucket = getBucket(req);
		if(!bucket){
			endWithNotFound(resp);
			return;
		}
		
		//处理获取文件片请求。
		if('GET' == req.method) {
			doGet(req, resp);
		}

		//处理上传文件请求。
		if('POST' == req.method) {
			doPost(req, resp);
		}

		//处理提交临时文件或其他操作的请求。
		if('PUT' == req.method) {
			doPut(req, resp);
		}
	}
});


//监听Redis键过期事件的回调方法，删除未提交的文件释放空间。
sub.on("pmessage", function(pattern, channel, message) {
	var meta = settings.tmpdir + '/' + message.substring(0, message.lastIndexOf('.')) + '.meta';
	if(fs.existsSync(meta)) {

		//读取元信息文件，查找出真实的文件名称，并删除元信息文件及真实文件。
		fs.readFile(meta,function(err, text) {
			var data = JSON.parse(text);
			
			fs.unlink(meta, function(err){
				fs.unlink(settings.tmpdir + '/' + data.file_name, function(){

				});
			});
	
		});
	}
});

//注册Redis键过期事件监听
sub.psubscribe('__keyevent@0__:*');

//打开GridFS数据库，启动HTTP服务监听。
db.open(function(err, db) {
	server.listen(3000);
});





