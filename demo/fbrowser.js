(function($){
	var index = 0;

	$.fn.fcommit = function(options) {
		options = options || {};

		return this.each(function () {
			var ele = $('span.hide-value',this);
		
			if(ele.length != 0 && ele.text() != '') {
				$.ajax(ele.text(),{
					'type' : 'PUT',
					'method' : 'PUT',
					'success' : function(data, textStatus, jqXHR){
						ele.text("");

						if(options.success){
							options.success.call(this,data, textStatus, jqXHR);
						}
					},
					'error' : options.error || function(){}
				});
			}


			return this;
		});

	};
	
    $.fn.fbrowser = function(options) {
		return this.each(function () {
			var $this = $(this);
			var is_first = true;

			$([
				'<form action="' + options.url + '" target="fbrowser_' + index + '" style="display:none;" class="hide-form" enctype="multipart/form-data" method="post">',
						'<input name="mode" value="iframe" />',
						'<input class="hide-file" type="file" name="file" />',
						'<span class="hide-value"></span>',
				'</form>',
				'<iframe class="hide-iframe" name="fbrowser_' + index + '" style="display:none;" ></iframe>'
			].join("")).appendTo($this);
			index++;
	
			$('input.hide-file',$this).change(function(){
				options.maxSize = options.maxSize || 512 * 1024;
				if(this.files[0].size > options.maxSize
						&& options.onMaxSize){
					options.onMaxSize.call($this,this.files[0].size);
				}
				
				if(is_first){
					is_first = false;
					$('iframe.hide-iframe',$this).load(function(e) {
						var value = options.url + '/' + $('iframe.hide-iframe',$this)[0].contentWindow.data.file_name;
						$('span.hide-value',$this).html(value);

						if(options.callback){
							options.callback.call($this,$('iframe.hide-iframe',$this)[0].contentWindow.data);
						}
					});
				}
				$('form.hide-form',$this).submit();
			});
	
			$('input.hide-file',$this).click(function(e){
				e.stopPropagation();
			});
	
			return $this.click(function(e){
				$('input.hide-file',$this).trigger('click');
			});
		});
    };
    
    
}(jQuery));
