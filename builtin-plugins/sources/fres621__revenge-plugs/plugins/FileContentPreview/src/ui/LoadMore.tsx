import { React } from '@vendetta/metro/common';
import { General } from '@vendetta/ui/components';

const { Text, TouchableOpacity } = General;

const LoadMore: any = ({ buttonColor, textColor, buttonTextColor, remainingText, onPress, moreText }) => {
  return (
    <>
      <Text style={{ color: textColor, marginTop: 7 }}>{remainingText}</Text>
      <TouchableOpacity style={{ backgroundColor: buttonColor, borderRadius: 5, padding: 10, marginBottom: 20, marginTop: 5 }} onPress={onPress}>
        <Text
          style={{
            color: buttonTextColor,
            textTransform: 'uppercase',
            fontWeight: 'bold',
            textAlign: 'center',
            fontSize: 20,
          }}>
          {moreText}
        </Text>
      </TouchableOpacity>
    </>
  );
};

export default LoadMore;
